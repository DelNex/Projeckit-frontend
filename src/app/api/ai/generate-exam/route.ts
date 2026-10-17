import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ExamQuestion,
  TosBlueprintSlot,
  buildTosBlueprintSlots,
  validateExamQuestions,
  CognitiveDomain,
} from '@/lib/exam-types';

export const maxDuration = 60; // 60 seconds max duration for exam generation

interface GenerateExamRequestBody {
  assessmentId?: string;
  tosId?: string;
  lessonText: string;
  targetItems: number;
  tosRows: any[];
  retryCount?: number;
  missingItemNumbers?: number[];
  regenerateSingleItemNumber?: number;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 1. Authenticate caller session
    const {
      data: { user: caller },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !caller) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to generate exams.' },
        { status: 401 }
      );
    }

    // 2. Verify caller profile
    const { data: callerProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, role, status, tenant_id, archived_at')
      .eq('id', caller.id)
      .maybeSingle();

    if (profileErr || !callerProfile || callerProfile.status !== 'approved' || callerProfile.archived_at) {
      return NextResponse.json(
        { error: 'Forbidden: Your account does not have active faculty privileges.' },
        { status: 403 }
      );
    }

    const body: GenerateExamRequestBody = await request.json().catch(() => ({}));
    const {
      assessmentId,
      tosId,
      lessonText,
      targetItems = 50,
      tosRows = [],
      retryCount = 0,
      missingItemNumbers,
      regenerateSingleItemNumber,
    } = body;

    if (!lessonText || !lessonText.trim()) {
      return NextResponse.json(
        { error: 'Please provide lesson materials or upload lesson notes.' },
        { status: 400 }
      );
    }

    if (targetItems < 1 || targetItems > 90) {
      return NextResponse.json(
        { error: 'Target items must be between 1 and 90.' },
        { status: 400 }
      );
    }

    // Safe sanitized lesson text (cap at 40,000 characters to prevent token explosion)
    const sanitizedLessonText = lessonText.slice(0, 40000).trim();

    // Build the expected TOS blueprint slots
    const allSlots = buildTosBlueprintSlots(tosRows, targetItems);

    // Determine target slots to generate
    let slotsToGenerate: TosBlueprintSlot[] = allSlots;
    if (regenerateSingleItemNumber) {
      slotsToGenerate = allSlots.filter((s) => s.item_number === regenerateSingleItemNumber);
      if (slotsToGenerate.length === 0) {
        slotsToGenerate = [
          {
            item_number: regenerateSingleItemNumber,
            competency_id: 'COMP-1',
            competency_code: 'COMP-1',
            competency_description: 'General Competency',
            cognitive_level: 'remembering',
          },
        ];
      }
    } else if (missingItemNumbers && missingItemNumbers.length > 0) {
      slotsToGenerate = allSlots.filter((s) => missingItemNumbers.includes(s.item_number));
    }

    // Attempt AI Generation or Fallback Generation
    let rawGeneratedQuestions: any[] = [];
    let generationSource = 'deterministic_curriculum_engine';

    try {
      const llmResult = await callExternalLlmIfConfigured(
        sanitizedLessonText,
        slotsToGenerate,
        regenerateSingleItemNumber ? 1 : slotsToGenerate.length
      );
      if (llmResult && llmResult.length > 0) {
        rawGeneratedQuestions = llmResult;
        generationSource = 'external_llm';
      }
    } catch (llmErr) {
      console.warn('[ExamGen] External LLM failed or not configured, using curriculum generator:', llmErr);
    }

    // If external LLM did not return questions, use deterministic curriculum synthesis
    if (rawGeneratedQuestions.length === 0) {
      rawGeneratedQuestions = generateQuestionsFromCurriculum(sanitizedLessonText, slotsToGenerate);
    }

    // If regenerating a single question, return that question directly
    if (regenerateSingleItemNumber) {
      const singleValidation = validateExamQuestions(rawGeneratedQuestions, 1, slotsToGenerate);
      const singleQuestion = singleValidation.repairedQuestions[0] || rawGeneratedQuestions[0];
      return NextResponse.json({
        success: true,
        source: generationSource,
        question: singleQuestion,
      });
    }

    // Self-healing validation step
    let validation = validateExamQuestions(rawGeneratedQuestions, targetItems, allSlots);

    // If items are missing and retryCount < 2, perform a targeted repair
    if (validation.missingItemNumbers.length > 0 && retryCount < 2) {
      const missingSlots = allSlots.filter((s) => validation.missingItemNumbers.includes(s.item_number));
      const repairedMissing = generateQuestionsFromCurriculum(sanitizedLessonText, missingSlots);

      const merged = [...validation.repairedQuestions, ...repairedMissing];
      validation = validateExamQuestions(merged, targetItems, allSlots);
    }

    // Final safety guarantee: if any slot is STILL missing, fill it immediately
    if (validation.missingItemNumbers.length > 0) {
      const stillMissingSlots = allSlots.filter((s) => validation.missingItemNumbers.includes(s.item_number));
      const emergencyFill = generateQuestionsFromCurriculum(sanitizedLessonText, stillMissingSlots);
      const fullyMerged = [...validation.repairedQuestions, ...emergencyFill];
      validation = validateExamQuestions(fullyMerged, targetItems, allSlots);
    }

    const finalQuestions = validation.repairedQuestions;

    // Persist to assessment if assessmentId provided
    const adminClient = createAdminClient();
    if (assessmentId) {
      await adminClient
        .from('assessments')
        .update({
          questions: finalQuestions,
          exam_status: 'DRAFT',
        })
        .eq('id', assessmentId);

      // Synchronize answer keys automatically
      const answersRecord: Record<number, string> = {};
      finalQuestions.forEach((q) => {
        answersRecord[q.item_number] = q.correct_answer;
      });

      await adminClient
        .from('answer_keys')
        .upsert(
          {
            assessment_id: assessmentId,
            tenant_id: callerProfile.tenant_id,
            answers: answersRecord,
          },
          { onConflict: 'assessment_id' }
        );
    }

    // Persist to tos_documents if tosId provided
    if (tosId) {
      await adminClient
        .from('tos_documents')
        .update({
          questions: finalQuestions,
        })
        .eq('id', tosId);
    }

    return NextResponse.json({
      success: true,
      source: generationSource,
      questions: finalQuestions,
      validation: {
        isValid: validation.isValid,
        errors: validation.errors,
        warnings: validation.warnings,
        distributionMatchesTOS: validation.distributionMatchesTOS,
      },
    });
  } catch (err: any) {
    console.error('Exam generation route error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to generate exam from lessons.' },
      { status: 500 }
    );
  }
}

/**
 * Attempts to query an external OpenAI/Gemini/Ollama provider if configured in the environment.
 */
async function callExternalLlmIfConfigured(
  lessonText: string,
  slots: TosBlueprintSlot[],
  expectedCount: number
): Promise<any[] | null> {
  const providerUrl = process.env.AI_PROVIDER_URL || '';
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';

  if (!providerUrl && !apiKey) return null;

  const endpoint = providerUrl
    ? providerUrl.includes('/chat/completions')
      ? providerUrl
      : `${providerUrl.replace(/\/+$/, '')}/chat/completions`
    : 'https://api.openai.com/v1/chat/completions';

  const slotDescriptions = slots
    .map(
      (s) =>
        `Item ${s.item_number}: Competency "${s.competency_code}" (${s.competency_description}), Cognitive Level: ${s.cognitive_level}`
    )
    .join('\n');

  const prompt = `You are a Department of Education (DepEd) Master Teacher examination specialist.
Generate exactly ${expectedCount} multiple-choice test questions based STRICTLY on the provided lesson text and the Table of Specifications (TOS) matrix below.

TOS BLUEPRINT MATRIX:
${slotDescriptions}

LESSON MATERIAL:
${lessonText}

STRICT INSTRUCTIONS:
1. Return ONLY a valid JSON array of objects. No markdown formatting, no conversational text.
2. Each object must have these exact keys:
   - "item_number": integer
   - "competency_id": string
   - "cognitive_level": one of "remembering", "understanding", "applying", "analyzing", "evaluating", "creating"
   - "question": string
   - "options": object with keys "A", "B", "C", "D"
   - "correct_answer": "A", "B", "C", or "D"
   - "rationale": concise explanation of why the correct option is right.
3. Every question must have 4 distinct, plausible options.`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(25000), // 25s timeout
  });

  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  const textContent =
    data?.choices?.[0]?.message?.content || data?.response || data?.content || '';

  if (!textContent) return null;

  // Extract JSON array
  const start = textContent.indexOf('[');
  const end = textContent.lastIndexOf(']');
  if (start !== -1 && end > start) {
    const jsonStr = textContent.slice(start, end + 1);
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) return parsed;
  }

  return null;
}

/**
 * Deterministic, curriculum-aligned exam generator.
 * Analyzes the lesson text sentences, key terms, definitions, and maps them
 * to the exact competency and Bloom's cognitive domain of each slot.
 */
function generateQuestionsFromCurriculum(
  lessonText: string,
  slots: TosBlueprintSlot[]
): ExamQuestion[] {
  // Extract sentences and key facts from lesson text
  const sentences = lessonText
    .split(/[.!?\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25 && /[a-zA-Z]/.test(s));

  const questions: ExamQuestion[] = [];

  slots.forEach((slot, idx) => {
    const itemNum = slot.item_number;
    const domain = slot.cognitive_level;
    const compDesc = slot.competency_description;
    const compCode = slot.competency_code;

    // Pick contextual sentence
    const sentence = sentences[idx % Math.max(1, sentences.length)] || compDesc;
    const words = sentence.split(/\s+/).filter((w) => w.length > 4);
    const keyTerm = words[0] || 'the core concept';

    let stem = '';
    let optA = '';
    let optB = '';
    let optC = '';
    let optD = '';
    let correct: 'A' | 'B' | 'C' | 'D' = 'A';
    let rationale = '';

    switch (domain) {
      case 'remembering':
        stem = `According to the lesson on ${compDesc}, which of the following is the primary definition or characteristic of ${keyTerm}?`;
        optA = `${sentence}.`;
        optB = `It serves exclusively as an auxiliary classification with no primary effect.`;
        optC = `It functions as an opposing mechanism that nullifies the observed outcome.`;
        optD = `It is an unrelated variable not governed by this principle.`;
        correct = 'A';
        rationale = `Option A directly recalls the foundational definition stated in the lesson: "${sentence}".`;
        break;

      case 'understanding':
        stem = `In the context of ${compDesc}, which statement best explains why ${keyTerm} is essential?`;
        optA = `Because it demonstrates an inverse relationship regardless of context.`;
        optB = `Because ${sentence.toLowerCase()}, allowing students to interpret the underlying relationship.`;
        optC = `Because it only applies under rare experimental laboratory settings.`;
        optD = `Because it replaces all standard principles of the subject matter.`;
        correct = 'B';
        rationale = `Option B provides the accurate conceptual explanation according to the curriculum standards.`;
        break;

      case 'applying':
        stem = `A learner is tasked with applying the principles of ${compDesc} to solve a practical problem. Which procedure should be executed first?`;
        optA = `Disregard the given parameters and use an arbitrary baseline.`;
        optB = `Analyze only the final output without verifying the input elements.`;
        optC = `Apply the relevant rule: "${sentence}", establishing the correct computational or conceptual foundation.`;
        optD = `Assume all dependent variables are equal to zero.`;
        correct = 'C';
        rationale = `Option C correctly applies the established rule to solve the practical situation.`;
        break;

      case 'analyzing':
        stem = `When analyzing the relationship between ${keyTerm} and related components in ${compDesc}, what key distinction emerges?`;
        optA = `Both components operate identically in every respect without differentiation.`;
        optB = `The components differ fundamentally because ${sentence.toLowerCase()}.`;
        optC = `Neither component contributes significantly to the final outcome.`;
        optD = `The relationship is purely coincidental and cannot be verified.`;
        correct = 'B';
        rationale = `Option B highlights the structural distinction identified during competency analysis.`;
        break;

      case 'evaluating':
        stem = `Which of the following criteria provides the most valid justification when evaluating solutions related to ${compDesc}?`;
        optA = `Whether the solution conforms to: "${sentence}".`;
        optB = `Whether the solution requires the least amount of effort regardless of accuracy.`;
        optC = `Whether the solution ignores standard curriculum conventions.`;
        optD = `Whether the solution produces unverified arbitrary outputs.`;
        correct = 'A';
        rationale = `Option A offers the most scientifically and pedagogically sound evaluation criterion.`;
        break;

      case 'creating':
      default:
        stem = `To formulate an effective model or synthesis demonstrating mastery in ${compDesc}, which framework should be synthesized?`;
        optA = `A synthesis that incorporates arbitrary variables with no theoretical backing.`;
        optB = `A synthesis that isolates only a single outlier while rejecting core data.`;
        optC = `A synthesis that omits all instructional guidelines.`;
        optD = `A synthesis that integrates the foundational principle: "${sentence}".`;
        correct = 'D';
        rationale = `Option D synthesizes the core principle into a coherent, high-level creative formulation.`;
        break;
    }

    questions.push({
      item_number: itemNum,
      competency_id: slot.competency_id,
      cognitive_level: domain,
      question: stem,
      options: {
        A: optA,
        B: optB,
        C: optC,
        D: optD,
      },
      correct_answer: correct,
      rationale,
    });
  });

  return questions;
}

