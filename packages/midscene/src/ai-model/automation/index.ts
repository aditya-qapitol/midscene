import assert from 'node:assert';
import type { AIUsageInfo, PlanningAIResponse, UIContext } from '@/types';
import {
  AIActionType,
  type AIArgs,
  callAiFn,
  transformUserMessages,
} from '../common';
import { systemPromptToTaskPlanning } from '../prompt/planning';
import { describeUserPage } from '../prompt/util';

export async function plan(
  userPrompt: string,
  opts: {
    whatHaveDone?: string;
    originalPrompt?: string;
    context: UIContext;
    callAI?: typeof callAiFn<PlanningAIResponse>;
  },
): Promise<PlanningAIResponse> {
  const { callAI, context } = opts || {};
  const { screenshotBase64, screenshotBase64WithElementMarker } = context;
  const { description: pageDescription, elementByPosition } =
    await describeUserPage(context);

  const systemPrompt = systemPromptToTaskPlanning();

  let taskBackgroundContext = '';
  if (opts.originalPrompt && opts.whatHaveDone) {
    taskBackgroundContext = `For your information, this is a task that some important person handed to you. Here is the original task description and what have been done after the previous actions:
=====================================
Original task description:
${opts.originalPrompt}
=====================================
What have been done:
${opts.whatHaveDone}
=====================================
`;
  }
  const msgs: AIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: transformUserMessages([
        {
          type: 'image_url',
          image_url: {
            url: screenshotBase64WithElementMarker || screenshotBase64,
            detail: 'high',
          },
        },
        {
          type: 'text',
          text: `
pageDescription:\n 
${pageDescription}
\n
Here is the instruction:
=====================================
${userPrompt}
=====================================

${taskBackgroundContext}
`.trim(),
        },
      ]),
    },
  ];

  const call = callAI || callAiFn;
  const { content, usage } = await call({
    msgs,
    AIActionType: AIActionType.PLAN,
  });

  const planFromAI = content;

  const actions = planFromAI?.actions || [];
  assert(planFromAI, "can't get plans from AI");
  assert(
    actions.length > 0,
    `Failed to plan actions with context: ${planFromAI.error}`,
  );

  return planFromAI;
}
