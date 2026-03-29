import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { ModelType, Employee } from '../types';

// Initialize the client
// Ideally, in a real app, this should be handled securely.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

// Store active chat instances in memory for this demo
const chatInstances: Record<string, Chat> = {};

export const getChatInstance = (sessionId: string, model: ModelType): Chat => {
  if (!chatInstances[sessionId]) {
    chatInstances[sessionId] = ai.chats.create({
      model: model,
      config: {
        systemInstruction: "你是一个苏州银行的专业AI助手。你需要帮助用户进行数据查询、知识库检索和财务分析。请保持回答专业、简洁且有帮助。请用中文回答。",
      },
    });
  }
  return chatInstances[sessionId];
};

export const sendMessageStream = async function* (
  sessionId: string,
  message: string,
  model: ModelType
): AsyncGenerator<string, void, unknown> {
  const chat = getChatInstance(sessionId, model);

  try {
    const result = await chat.sendMessageStream({ message });

    for await (const chunk of result) {
      const responseChunk = chunk as GenerateContentResponse;
      if (responseChunk.text) {
        yield responseChunk.text;
      }
    }
  } catch (error) {
    console.error("Error generating content:", error);
    yield "抱歉，处理您的请求时遇到错误。请稍后再试。";
  }
};

export const generateProfessionalBio = async (employee: Employee): Promise<string> => {
  try {
    const prompt = `
      你是一位专业的企业文案策划。请根据以下苏州银行员工的信息，为他写一段简短、专业且富有亲和力的个人工作简介（100字左右）。
      
      姓名: ${employee.name}
      职位: ${employee.title}
      部门: ${employee.department}
      
      简介要求：
      1. 突出专业能力和银行的服务宗旨。
      2. 语气诚恳、自信。
      3. 适用于企业内部档案或对外名片展示。
      4. 只返回简介文本，不要包含任何前言或后语。
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "无法生成简介，请稍后重试。";
  } catch (error) {
    console.error("Error generating bio:", error);
    // Fallback or re-throw
    return "AI 生成服务暂时不可用。";
  }
};

