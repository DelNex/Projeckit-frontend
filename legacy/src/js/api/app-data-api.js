// AppData API is deprecated. Use the relational endpoints (Config API, Responses API) instead.
export async function getAppData(_) {
  throw new Error('AppData API is deprecated — use /api/config or /api/config/responses endpoints instead');
}

export async function saveAppData() {
  throw new Error('AppData API is deprecated — use /api/config or /api/config/responses endpoints instead');
}
