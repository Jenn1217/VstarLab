import { FavoriteItem } from './types';

export const MOCK_FAVORITES: FavoriteItem[] = [
    {
        id: 'fav-1',
        type: 'AI_ANSWER',
        title: '关于2025年Q1信贷风险的分析回答',
        subtitle: '来源对话：2025年度战略规划会议记录',
        summary: '根据最新的市场数据，2025年第一季度信贷风险主要集中在房地产及相关供应链企业...',
        tags: ['风险控制', '信贷', '2025'],
        createdAt: '2025-01-15T10:30:00Z',
        updatedAt: '2025-01-15T10:30:00Z',
        content: '### 信贷风险分析\n\n1. **房地产行业**：持续承压，需重点关注头部房企的债务重组进展。\n2. **制造业**：出口导向型企业可能面临汇率波动风险。\n3. **建议**：收紧对高杠杆企业的授信额度。',
        actions: { canView: true, canExport: true }
    },
    {
        id: 'fav-2',
        type: 'CHAT_THREAD',
        title: '企业会计准则第33号深度解读',
        subtitle: '包含 12 个问答回合',
        summary: '详细讨论了关于合并财务报表的具体操作流程和抵销分录的编制方法。',
        tags: ['会计准则', '财务报表'],
        createdAt: '2024-12-20T14:20:00Z',
        updatedAt: '2024-12-28T09:15:00Z',
        meta: { turnCount: 12 },
        actions: { canView: true, canExport: true }
    },
    {
        id: 'fav-3',
        type: 'KNOWLEDGE_BASE',
        title: '银行会计操作手册',
        subtitle: '包含 10 个文档',
        summary: '详细的银行会计业务流程与操作规范，包含柜面业务、支付结算等模块。',
        tags: ['操作手册', '制度文件'],
        createdAt: '2024-11-10T08:00:00Z',
        updatedAt: '2025-02-01T11:00:00Z',
        meta: { fileCount: 10 },
        actions: { canView: true }
    },
    {
        id: 'fav-4',
        type: 'KB_ARTICLE',
        title: '企业会计准则第33号——合并财务报表.docx',
        subtitle: '所属知识库：会计准则及解释',
        summary: '本准则规范了合并财务报表的编制和列报。',
        tags: ['准则', 'PDF'],
        createdAt: '2024-10-29T16:00:00Z',
        updatedAt: '2024-10-29T16:00:00Z',
        content: '第一章 总则\n第一条 为了规范合并财务报表的编制和列报，根据《企业会计准则——基本准则》，制定本准则。\n第二条 合并财务报表，是指反映母公司和其全部子公司形成的企业集团整体财务状况、经营成果和现金流量的财务报表...',
        actions: { canView: true, canExport: true }
    },
    {
        id: 'fav-5',
        type: 'AI_ANSWER',
        title: '如何处理跨期费用的会计分录？',
        subtitle: '来源对话：日常业务咨询',
        summary: '针对跨期费用，应遵循权责发生制原则，通过待摊费用或预提费用科目进行核算...',
        tags: ['会计实务', '费用核算'],
        createdAt: '2025-02-14T09:30:00Z',
        updatedAt: '2025-02-14T09:30:00Z',
        content: '对于跨期费用，建议按以下步骤处理：\n1. 确认费用归属期间。\n2. 若为预付，借记“预付账款”或“长期待摊费用”。\n3. 若为后付，贷记“应付账款”或“预提费用”。',
        actions: { canView: true }
    },
    {
        id: 'fav-6',
        type: 'KB_ARTICLE',
        title: '关于加强账户管理的通知.pdf',
        subtitle: '所属知识库：合规问题与政策指引',
        summary: '关于进一步加强对公账户开立、使用和变更管理的具体要求。',
        tags: ['合规', '账户管理', '通知'],
        createdAt: '2025-01-05T13:45:00Z',
        updatedAt: '2025-01-05T13:45:00Z',
        content: '各分行：\n为防范电信诈骗风险，现就加强对公账户管理提出如下要求...\n一、严格审核开户资料...\n二、加强后续交易监控...',
        actions: { canView: false } // Mocking no access
    }
];
