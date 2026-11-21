'use client';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
    Bot,
    Check,
    Copy,
    Info,
    Loader2,
    Paperclip,
    Send,
    StopCircle,
    ThumbsDown,
    ThumbsUp,
    Trash2,
    User,
    X
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  status?: 'streaming' | 'complete' | 'error';
  suggestedChips?: string[];
  feedback?: 'like' | 'dislike' | null;
}

interface AiInfoState {
  aiVersion?: string;
  planner?: { status: string };
  systemPromptLoaded?: boolean;
  toolCount?: number;
  tools?: { name?: string; id?: string; description?: string }[];
  session?: { displayName?: string; role?: string; tenantName?: string };
}

interface AiCopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessmentId?: number | null;
  assessmentTitle?: string | null;
}

export function AiCopilotModal({
  isOpen,
  onClose,
  assessmentId,
  assessmentTitle,
}: AiCopilotModalProps) {
  const pathname = usePathname();
  const dialogId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);

  // Active context state
  const [activeContextId, setActiveContextId] = useState<number | null>(assessmentId ?? null);
  const [activeContextTitle, setActiveContextTitle] = useState<string | null>(assessmentTitle ?? null);

  // Messages & input state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content:
        "Hello! I am your **Project KIT AI Copilot**. I can help you analyze item difficulty, interpret discrimination indices, suggest test revisions, and guide OMR evaluation.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'complete',
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // System info sidebar state
  const [showSidebar, setShowSidebar] = useState(false);
  const [aiInfo, setAiInfo] = useState<AiInfoState | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);

  // File upload state
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Derive screen slug from pathname
  const pageSlug = useMemo(() => {
    if (!pathname || pathname === '/') return 'dashboard';
    const parts = pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'dashboard';
  }, [pathname]);

  // Context-aware prompt suggestions
  const suggestedChips = useMemo(() => {
    if (pageSlug === 'item-analysis' || pathname.includes('analytics')) {
      return [
        'Explain difficulty index (p)',
        'What does discrimination (D) mean?',
        'Which items require revision?',
        'How to improve test validity?',
      ];
    }
    if (pageSlug === 'assessments' || pathname.includes('assessments')) {
      return [
        'How do I calibrate the OMR camera?',
        'Guide me through TOS setup',
        'Check assessment passing benchmark',
        'How to print student answer sheets?',
      ];
    }
    if (pageSlug === 'students') {
      return [
        'Validate DepEd 12-digit LRN rules',
        'How to organize sections for scanning?',
        'What to do if a student transferred?',
      ];
    }
    return [
      'Summarize quarterly academic performance',
      'Which sections need academic intervention?',
      'Explain DepEd MPS calculation standards',
      'What can you help me with?',
    ];
  }, [pageSlug, pathname]);

  // Sync assessment context from props or route
  useEffect(() => {
    if (assessmentId) {
      setActiveContextId(assessmentId);
      setActiveContextTitle(assessmentTitle || `Assessment #${assessmentId}`);
    } else if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const qId = sp.get('id') || sp.get('assessmentId');
      if (qId && !isNaN(Number(qId))) {
        setActiveContextId(Number(qId));
        setActiveContextTitle(`Assessment #${qId}`);
      }
    }
  }, [assessmentId, assessmentTitle, pathname]);

  // Autoscroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Fetch AI info when sidebar is opened
  useEffect(() => {
    if (showSidebar && !aiInfo) {
      setLoadingInfo(true);
      api.ai
        .getInfo()
        .then((data) => {
          setAiInfo(data);
        })
        .catch((err) => {
          console.warn('Could not load AI info:', err);
        })
        .finally(() => {
          setLoadingInfo(false);
        });
    }
  }, [showSidebar, aiInfo]);

  // Keep keyboard focus inside the dialog and return it to the launcher on close.
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const selector = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
    const frame = window.requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>(selector);
      (first || dialogRef.current)?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        abortControllerRef.current?.abort();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(selector) || [])
        .filter((element) => element.offsetWidth > 0 || element.offsetHeight > 0);
      if (!focusable.length) { event.preventDefault(); dialogRef.current?.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      abortControllerRef.current?.abort();
      setIsStreaming(false);
      setMessages((current) => current.map((message) => message.status === 'streaming'
        ? { ...message, content: message.content ? `${message.content}\n\nStopped receiving the response. Any action already in progress may still finish.` : 'Stopped receiving the response. Any action already in progress may still finish.', status: 'complete' }
        : message));
      activeAssistantMessageIdRef.current = null;
      previousFocus?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Send query handler
  const handleSendMessage = async (queryText?: string) => {
    const textToSend = (queryText || inputQuery).trim();
    if (!textToSend || isStreaming) return;

    setInputQuery('');
    const userMsgId = `usr-${Date.now()}`;
    const assistantMsgId = `ast-${Date.now()}`;
    activeAssistantMessageIdRef.current = assistantMsgId;

    // Add user message & placeholder assistant message
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: 'user',
        content: textToSend,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
      {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'streaming',
      },
    ]);

    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const payload = {
      message: textToSend,
      assessmentId: activeContextId || undefined,
      context: { page: pageSlug },
      uiContext: {
        pageId: pageSlug,
        activeAssessmentId: activeContextId,
        url: typeof window !== 'undefined' ? window.location.href : '',
      },
    };

    let accumulatedResponse = '';

    try {
      // Try streaming endpoint via SSE
      await api.ai.stream(payload, {
        signal: abortController.signal,
        onChunk: (chunk: string) => {
          accumulatedResponse += chunk;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, content: accumulatedResponse, status: 'streaming' }
                : msg
            )
          );
        },
        onDone: () => {
          activeAssistantMessageIdRef.current = null;
          setIsStreaming(false);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, status: 'complete' } : msg
            )
          );
        },
      });
    } catch (err: any) {
      if (err?.name === 'AbortError' || abortController.signal.aborted) return;

      // Never replay a failed stream through chat: the server may already have
      // completed a tool action before the connection was interrupted.
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                content: accumulatedResponse
                  ? `${accumulatedResponse}\n\nI couldn't finish receiving the response. Your request may already have been processed, so I did not send it again. Check the current page before retrying.`
                  : 'I could not receive the AI response. Your request may already have been processed, so I did not send it again. Check the current page before retrying.',
                status: 'error',
              }
            : msg
        )
      );
      activeAssistantMessageIdRef.current = null;
      setIsStreaming(false);
    }
  };

  const handleStopGeneration = () => {
    abortControllerRef.current?.abort();
    const activeId = activeAssistantMessageIdRef.current;
    if (activeId) setMessages((prev) => prev.map((message) => message.id === activeId
      ? { ...message, content: message.content ? `${message.content}\n\nStopped receiving the response. Any action already in progress may still finish.` : 'Stopped receiving the response. Any action already in progress may still finish.', status: 'complete' }
      : message));
    activeAssistantMessageIdRef.current = null;
    setIsStreaming(false);
  };

  // Handle module upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    setUploadMessage(null);
    try {
      const res = await api.ai.uploadModule(file);
      setUploadMessage(`"${file.name}" indexed successfully!`);
      // Notify chat
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: 'assistant',
          content: `📄 **Module Attached**: "${file.name}" has been processed and indexed into the RAG context. You can now ask questions about its content.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          status: 'complete',
        },
      ]);
      setTimeout(() => setUploadMessage(null), 4000);
    } catch (err: any) {
      console.error('File upload failed:', err);
      setUploadMessage(`Upload failed: ${err.message || 'Check backend'}`);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Copy text to clipboard
  const handleCopy = (text: string, msgId: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Toggle feedback
  const handleFeedback = (msgId: string, type: 'like' | 'dislike') => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, feedback: m.feedback === type ? null : type } : m
      )
    );
  };

  // Clear chat
  const handleClearChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: 'Chat history cleared. How can I assist you today with your assessments?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'complete',
      },
    ]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm animate-in fade-in duration-200 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} id={dialogId} role="dialog" aria-modal="true" aria-labelledby={`${dialogId}-title`} aria-describedby={`${dialogId}-description`} tabIndex={-1} className="relative flex h-[100dvh] max-h-[100dvh] w-full max-w-5xl overflow-hidden rounded-none border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900 sm:h-[min(760px,92dvh)] sm:max-h-[92dvh] sm:rounded-3xl">
        {/* Main Chat Pane */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Modal Header */}
          <div className="flex h-16 items-center justify-between border-b border-gray-100 px-6 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--pk-line)] bg-[var(--pk-raised)] text-[var(--pk-text)]">
                <Bot className="h-4 w-4 stroke-[1.5]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 id={`${dialogId}-title`} className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
                    Project KIT AI Copilot
                  </h2>
                  
                </div>
                <p id={`${dialogId}-description`} className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">
                  Psychometrics, Table of Specifications &amp; OMR Guidance
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSidebar(!showSidebar)}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 transition',
                  showSidebar && 'bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'
                )}
                title="Toggle System Info Sidebar"
                aria-label="Toggle AI system information"
                aria-expanded={showSidebar}
                aria-controls={`${dialogId}-system-info`}
              >
                <Info className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={handleClearChat}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 transition"
                title="Clear Chat History"
                aria-label="Clear chat history"
                disabled={isStreaming || uploadingFile}
              >
                <Trash2 className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close AI Copilot"
                className="flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 transition"
                title="Close (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Context Banner */}
          {activeContextId && (
            <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50/60 px-6 py-2 text-xs text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
                <span className="font-semibold">
                  Context: {activeContextTitle || `Assessment #${activeContextId}`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveContextId(null);
                  setActiveContextTitle(null);
                }}
                className="text-[10px] font-bold uppercase tracking-wider text-blue-500 hover:text-blue-700 dark:hover:text-blue-200"
              >
                Clear Context
              </button>
            </div>
          )}

          {/* Messages Scroll Area */}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 space-y-4 custom-scrollbar sm:px-6" role="log" aria-label="Conversation messages" aria-live="off" aria-relevant="additions text">
            <p className="sr-only" role="status" aria-live="polite">{isStreaming ? 'AI Copilot is generating a response.' : 'AI Copilot is ready.'}</p>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex gap-3 text-xs',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {msg.role === 'assistant' && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-2xs mt-0.5">
                    <Bot className="h-4 w-4" />
                  </div>
                )}

                <div
                  className={cn(
                    'max-w-[90%] break-words rounded-2xl p-3 text-[13px] space-y-2 leading-relaxed shadow-2xs sm:max-w-[82%] sm:p-4',
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-[var(--pk-raised)] text-[var(--pk-text)] border border-[var(--pk-line)] rounded-bl-none'
                  )}
                >
                  {/* Content with basic bold / markdown parsing */}
                  <div className="select-text [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_h1]:my-2 [&_h1]:text-base [&_h1]:font-bold [&_h2]:my-2 [&_h2]:text-sm [&_h2]:font-bold [&_h3]:my-2 [&_h3]:font-semibold [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-blue-500 [&_blockquote]:pl-3 [&_blockquote]:text-gray-600 dark:[&_blockquote]:text-gray-300 [&_a]:font-semibold [&_a]:text-blue-600 [&_a]:underline dark:[&_a]:text-blue-400 [&_table]:my-2 [&_table]:w-full [&_table]:text-left [&_th]:border-b [&_th]:border-gray-300 [&_th]:px-2 [&_th]:py-1 [&_td]:border-b [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1 dark:[&_th]:border-gray-700 dark:[&_td]:border-gray-800">
                    {msg.content ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                        a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>,
                        pre: ({ children }) => <pre className="my-2 max-w-full overflow-x-auto rounded-lg bg-gray-950 p-3 text-[11px] text-gray-100">{children}</pre>,
                        code: ({ children, className }) => <code className={cn('rounded bg-gray-200/80 px-1 py-0.5 font-mono text-[0.9em] dark:bg-gray-700/80', className)}>{children}</code>,
                        table: ({ children }) => <div className="my-2 max-w-full overflow-x-auto"><table>{children}</table></div>,
                      }}>{msg.content}</ReactMarkdown>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-gray-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...
                      </span>
                    )}
                    {msg.status === 'streaming' && (
                      <span className="inline-block h-3.5 w-1.5 ml-1 bg-blue-600 dark:bg-blue-400 animate-pulse" />
                    )}
                  </div>

                  {/* Assistant Action Bar on completed turns */}
                  {msg.role === 'assistant' && msg.status !== 'streaming' && msg.content && (
                    <div className="flex items-center justify-between border-t border-gray-200/60 dark:border-gray-700/60 pt-2 mt-2 text-[10px] text-gray-400">
                      <span>{msg.timestamp}</span>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.content, msg.id)}
                          className="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition"
                          title="Copy response"
                          aria-label={copiedId === msg.id ? 'Response copied' : 'Copy response'}
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-500" />
                              <span className="text-emerald-500 font-semibold">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleFeedback(msg.id, 'like')}
                          className={cn(
                            'p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition',
                            msg.feedback === 'like' && 'text-blue-600 dark:text-blue-400 font-bold'
                          )}
                          title="Helpful"
                          aria-label="Mark response helpful"
                          aria-pressed={msg.feedback === 'like'}
                        >
                          <ThumbsUp className="h-3 w-3" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleFeedback(msg.id, 'dislike')}
                          className={cn(
                            'p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition',
                            msg.feedback === 'dislike' && 'text-red-500 font-bold'
                          )}
                          title="Not helpful"
                          aria-label="Mark response not helpful"
                          aria-pressed={msg.feedback === 'dislike'}
                        >
                          <ThumbsDown className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300 mt-0.5">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggested Prompt Chips */}
          <div className="border-t border-gray-100 bg-gray-50/50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/50 sm:px-6">
            <div className="flex items-center gap-1.5 overflow-x-auto overflow-y-hidden pr-5 pb-2 text-xs no-scrollbar [mask-image:linear-gradient(to_right,#000_0%,#000_92%,transparent_100%)]">
              <span className="text-[10px] font-semibold text-[var(--pk-text-muted)] shrink-0 mr-1">
                Suggested
              </span>
              {suggestedChips.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(chip)}
                  disabled={isStreaming}
                  className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-2 text-[11px] font-medium text-gray-700 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-blue-500 dark:hover:bg-blue-900/30 dark:hover:text-blue-300 transition"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Composer / Input Area */}
          <div className="shrink-0 border-t border-gray-100 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 dark:border-gray-800 sm:p-4">
            {uploadMessage && (
              <div className="mb-2 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5" />
                <span>{uploadMessage}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-end gap-2"
              aria-label="Send a message to AI Copilot"
            >
              {/* File upload button */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".pdf,.docx,.txt,.md"
                className="sr-only"
                aria-label="Attach a curriculum or module document"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile || isStreaming}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 transition"
                aria-label="Attach curriculum or module document"
                title="Attach Curriculum / Module document (PDF, DOCX, TXT)"
              >
                {uploadingFile ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </button>

              <textarea
                rows={1}
                aria-label="Message AI Copilot"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={
                  activeContextTitle
                    ? `Ask anything about ${activeContextTitle}...`
                    : 'Ask anything about assessments, TOS, or psychometrics...'
                }
                disabled={isStreaming}
                className="max-h-32 min-h-[52px] flex-1 resize-y rounded-xl border border-gray-200 bg-white px-3 py-3.5 text-sm leading-5 font-medium text-[var(--pk-text)] outline-none transition placeholder:text-[var(--pk-text-muted)] focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:border-blue-500 sm:px-4"
              />

              {isStreaming ? (
                <button type="button" onClick={handleStopGeneration} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700" aria-label="Stop generating response" title="Stop generating">
                  <StopCircle className="h-5 w-5" />
                </button>
              ) : (
                <button type="submit" disabled={!inputQuery.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40" aria-label="Send message">
                  <Send className="h-4 w-4" />
                </button>
              )}
            </form>
          </div>
        </div>

        {/* Collapsible System Info Drawer */}
        {showSidebar && (
          <>
          <button type="button" className="absolute inset-0 z-10 bg-black/30 sm:hidden" aria-label="Close AI system information" onClick={() => setShowSidebar(false)} />
          <div id={`${dialogId}-system-info`} className="absolute inset-x-0 bottom-0 z-20 max-h-[72%] w-full shrink-0 overflow-y-auto rounded-t-2xl border-t border-gray-100 bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] dark:border-gray-800 dark:bg-gray-900 sm:static sm:inset-auto sm:max-h-none sm:w-80 sm:rounded-none sm:border-l sm:border-t-0 sm:bg-gray-50/60 sm:p-5 sm:pb-5 sm:dark:bg-gray-900/60 custom-scrollbar text-xs">
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-inherit pb-3 dark:border-gray-800">
              <span className="font-bold text-gray-900 dark:text-white">AI Engine Info</span>
              <button
                type="button"
                onClick={() => setShowSidebar(false)}
                aria-label="Close AI system information"
                className="flex h-10 w-10 items-center justify-center rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loadingInfo ? (
              <div className="py-8 text-center text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                <span>Loading engine stats...</span>
              </div>
            ) : (
              <div className="space-y-4 pt-4">
                {/* System Section */}
                <div>
                  <h4 className="font-bold text-gray-400 uppercase text-[10px] tracking-wider mb-2">
                    System
                  </h4>
                  <div className="space-y-1.5 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-800">
                    <div className="flex justify-between">
                      <span className="text-gray-500">AI Version</span>
                      <span className="font-mono font-semibold text-gray-900 dark:text-white">
                        {aiInfo?.aiVersion || '2.0.4-deped'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Planner</span>
                      <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {aiInfo?.planner?.status || 'Active'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">System Prompt</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {aiInfo?.systemPromptLoaded ? 'Loaded' : 'Standard'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Registered Tools</span>
                      <span className="font-mono font-semibold text-gray-900 dark:text-white">
                        {aiInfo?.toolCount ?? 8}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Session Section */}
                <div>
                  <h4 className="font-bold text-gray-400 uppercase text-[10px] tracking-wider mb-2">
                    Session
                  </h4>
                  <div className="space-y-1.5 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-800">
                    <div className="flex justify-between">
                      <span className="text-gray-500">School</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {aiInfo?.session?.tenantName || 'School'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">User Role</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {aiInfo?.session?.role || 'TEACHER'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Available Tools */}
                <div>
                  <h4 className="font-bold text-gray-400 uppercase text-[10px] tracking-wider mb-2">
                    Available Tools
                  </h4>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {(aiInfo?.tools || [
                      { name: 'tos.inspect', description: 'Table of specifications evaluator' },
                      { name: 'results.calculate', description: 'Psychometric item difficulty & discrimination calculator' },
                      { name: 'remediation.generate', description: 'Generates targeted learner practice items' },
                      { name: 'module.rag', description: 'Searches uploaded textbook modules' },
                    ]).map((t, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-gray-100 bg-white p-2 text-[11px] dark:border-gray-800 dark:bg-gray-800"
                      >
                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                          {t.name || t.id}
                        </span>
                        <p className="text-gray-500 dark:text-gray-400 text-[10px] mt-0.5">
                          {t.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          </>
        )}
      </div>
    </div>
  );
}
