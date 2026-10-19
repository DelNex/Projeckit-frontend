import { createBrowserClient } from '@supabase/ssr';
import { getValidatedFrontendEnv } from '@/lib/env';

// Browser-only, user-scoped cache for successful Supabase reads. This keeps
// repeated page visits fast while bounding how long external changes can remain
// unseen. Writes clear the cache because related tables may also be affected.
const QUERY_CACHE_TTL_MS = 10_000;
const QUERY_CACHE_MAX_ENTRIES = 200;
const NO_CACHE_TABLES = new Set([
  'tos_documents', 'assessments', 'answer_keys', 'exam_generation_jobs',
  'school_settings', 'platform_settings', 'profiles',
]);
export function shouldCacheSupabaseRead(table: string, selectedColumns: string[] = []): boolean {
  return !NO_CACHE_TABLES.has(table) && !selectedColumns.some((columns) => columns.trim() === '*' || /\b(questions|answers)\b/i.test(columns));
}
type QueryCacheEntry = { expiresAt: number; value?: any; pending?: Promise<any> };
const queryCache = new Map<string, QueryCacheEntry>();
let activeUserId: string | null = null;
let sharedBrowserClient: any = null;
let cacheGeneration = 0;
let authGeneration = 0;
type BrowserSupabaseClient = ReturnType<typeof createBrowserClient<any>>;

export function invalidateClientQueryCache() {
  cacheGeneration += 1;
  queryCache.clear();
}

function stableArgs(args: unknown[]) {
  try {
    return JSON.stringify(args);
  } catch {
    return String(args);
  }
}

function rememberQuery(key: string, pending: Promise<any>, generation: number) {
  queryCache.delete(key);
  queryCache.set(key, { expiresAt: Number.POSITIVE_INFINITY, pending });
  while (queryCache.size > QUERY_CACHE_MAX_ENTRIES) {
    const oldestKey = queryCache.keys().next().value;
    if (oldestKey === undefined) break;
    queryCache.delete(oldestKey);
  }

  pending.then(
    (result) => {
      if (generation !== cacheGeneration || queryCache.get(key)?.pending !== pending) return;
      if (result?.error) {
        queryCache.delete(key);
        return;
      }
      queryCache.set(key, { expiresAt: Date.now() + QUERY_CACHE_TTL_MS, value: result });
    },
    () => {
      if (queryCache.get(key)?.pending === pending) queryCache.delete(key);
    }
  );
}

function wrapQueryBuilder(builder: any, table: string, calls: string[], canCache: boolean): any {
  if (!builder || (typeof builder !== 'object' && typeof builder !== 'function')) return builder;

  return new Proxy(builder, {
    get(target, property) {
      if (property === 'then' && typeof target.then === 'function') {
        return (onFulfilled?: (value: any) => any, onRejected?: (reason: any) => any) => {
          const key = activeUserId
            ? `${activeUserId}:${table}:${calls.join('|')}`
            : null;
          if (!canCache || !key) {
            return Reflect.apply(target.then, target, [onFulfilled, onRejected]);
          }

          const cached = queryCache.get(key);
          if (cached?.pending) return cached.pending.then(onFulfilled, onRejected);
          if (cached && cached.expiresAt > Date.now()) {
            // Keep the entry recent in the bounded LRU-style map.
            queryCache.delete(key);
            queryCache.set(key, cached);
            return Promise.resolve(cached.value).then(onFulfilled, onRejected);
          }

          let resolveRequest!: (value: any) => void;
          let rejectRequest!: (reason: any) => void;
          const pending = new Promise<any>((resolve, reject) => {
            resolveRequest = resolve;
            rejectRequest = reject;
          });
          rememberQuery(key, pending, cacheGeneration);
          Reflect.apply(target.then, target, [resolveRequest, rejectRequest]);
          return pending.then(onFulfilled, onRejected);
        };
      }

      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;

      return (...args: unknown[]) => {
        const method = String(property);
        const isWrite = ['insert', 'upsert', 'update', 'delete'].includes(method);
        if (isWrite) invalidateClientQueryCache();
        const nextCalls = [...calls, `${method}:${stableArgs(args)}`];
        const nextBuilder = Reflect.apply(value, target, args);
        return wrapQueryBuilder(nextBuilder, table, nextCalls,
          canCache && !isWrite && shouldCacheSupabaseRead(table,
            method === 'select' ? (args.filter((arg): arg is string => typeof arg === 'string').length
              ? args.filter((arg): arg is string => typeof arg === 'string') : ['*']) : []));
      };
    },
  });
}

function createCachedBrowserClient(url: string, key: string) {
  const client = createBrowserClient<any>(url, key);
  activeUserId = null;
  const initialAuthGeneration = authGeneration;

  void client.auth.getSession().then(({ data }: any) => {
    if (initialAuthGeneration === authGeneration) {
      activeUserId = data.session?.user?.id || null;
    }
  });
  client.auth.onAuthStateChange((_event: string, session: any) => {
    const nextUserId = session?.user?.id || null;
    authGeneration += 1;
    if (nextUserId !== activeUserId) invalidateClientQueryCache();
    activeUserId = nextUserId;
  });

  return new Proxy(client, {
    get(target, property) {
      if (property === 'from') {
        return (table: string) => wrapQueryBuilder(target.from(table), table, [], true);
      }
      if (property === 'rpc') {
        return (...args: unknown[]) => {
          invalidateClientQueryCache();
          return Reflect.apply(target.rpc, target, args);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export function createClient(): BrowserSupabaseClient {
  const env = getValidatedFrontendEnv();
  // Never share a Supabase client across server renders or users. The singleton
  // and query cache are created only in the browser and are scoped by auth user.
  if (typeof window === 'undefined') {
    return createBrowserClient<any>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    );
  }

  if (!sharedBrowserClient) {
    sharedBrowserClient = createCachedBrowserClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    );
  }
  return sharedBrowserClient;
}
