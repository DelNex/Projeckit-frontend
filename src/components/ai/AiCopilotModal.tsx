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
    Sparkles,
    ThumbsDown,
    ThumbsUp,
    Trash2,
    User,
    X
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';

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

  // Keyboard escape listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Send query handler
  const handleSendMessage = async (queryText?: string) => {
    const textToSend = (queryText || inputQuery).trim();
    if (!textToSend || isStreaming) return;

    setInputQuery('');
    const userMsgId = `usr-${Date.now()}`;
    const assistantMsgId = `ast-${Date.now()}`;

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
          setIsStreaming(false);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, status: 'complete' } : msg
            )
          );
        },
        onError: async (streamErr) => {
          console.warn('Streaming error, falling back to chat POST:', streamErr);
          // Fallback to standard chat endpoint if stream failed
          try {
            const fallbackRes = await api.ai.chat(payload);
            const reply = fallbackRes?.reply || 'I processed your request.';
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId ? { ...msg, content: reply, status: 'complete' } : msg
              )
            );
          } catch (chatErr: any) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? {
                      ...msg,
                      content: `I encountered an error communicating with the AI service: ${chatErr?.message || 'Server unavailable'}. Please verify backend connection.`,
                      status: 'error',
                    }
                  : msg
              )
            );
          } finally {
            setIsStreaming(false);
          }
        },
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') return;

      // Direct fallback call
      try {
        const fallbackRes = await api.ai.chat(payload);
        const reply = fallbackRes?.reply || 'I processed your request.';
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId ? { ...msg, content: reply, status: 'complete' } : msg
          )
        );
      } catch (chatErr: any) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  content: `I encountered an issue: ${chatErr?.message || 'AI service offline'}. Please ensure the Project KIT backend is running on port 4000.`,
                  status: 'error',
                }
              : msg
          )
        );
      } finally {
        setIsStreaming(false);
      }
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex h-[620px] max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        {/* Main Chat Pane */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Modal Header */}
          <div className="flex h-16 items-center justify-between border-b border-gray-100 px-6 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xs">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
                    Project KIT AI Copilot
                  </h2>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
                    DepEd Assistant
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-tight">
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
              >
                <Info className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={handleClearChat}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 transition"
                title="Clear Chat History"
              >
                <Trash2 className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 transition"
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
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 custom-scrollbar">
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
                    'max-w-[82%] rounded-2xl p-4 space-y-2 leading-relaxed shadow-2xs',
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-gray-50 dark:bg-gray-800/70 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-800 rounded-bl-none'
                  )}
                >
                  {/* Content with basic bold / markdown parsing */}
                  <div className="whitespace-pre-wrap select-text">
                    {msg.content ? (
                      msg.content
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
          <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-2.5 dark:border-gray-800 dark:bg-gray-900/50">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 shrink-0 mr-1">
                Suggested:
              </span>
              {suggestedChips.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(chip)}
                  disabled={isStreaming}
                  className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-medium text-gray-700 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-600 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-blue-500 dark:hover:bg-blue-900/30 dark:hover:text-blue-300 transition"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Composer / Input Area */}
          <div className="border-t border-gray-100 p-4 dark:border-gray-800">
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
              className="flex items-center gap-2"
            >
              {/* File upload button */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".pdf,.docx,.txt,.md"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile || isStreaming}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 transition"
                title="Attach Curriculum / Module document (PDF, DOCX, TXT)"
              >
                {uploadingFile ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </button>

              <input
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder={
                  activeContextTitle
                    ? `Ask anything about ${activeContextTitle}...`
                    : 'Ask anything about assessments, TOS, or psychometrics...'
                }
                disabled={isStreaming}
                className="h-10 flex-1 rounded-xl border border-gray-200 bg-white px-4 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:border-blue-500"
              />

              <button
                type="submit"
                disabled={!inputQuery.trim() || isStreaming}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs hover:bg-blue-700 disabled:opacity-40 disabled:pointer-events-none transition"
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Collapsible System Info Drawer */}
        {showSidebar && (
          <div className="w-80 shrink-0 border-l border-gray-100 bg-gray-50/60 p-5 dark:border-gray-800 dark:bg-gray-900/60 overflow-y-auto custom-scrollbar text-xs">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3 dark:border-gray-800">
              <span className="font-bold text-gray-900 dark:text-white">AI Engine Info</span>
              <button
                type="button"
                onClick={() => setShowSidebar(false)}
                className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
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
                        {aiInfo?.session?.tenantName || 'Capas SHS'}
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
        )}
      </div>
    </div>
  );
}
