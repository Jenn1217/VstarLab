import { Post } from '../types';

const STORAGE_KEY = 'community_posts_v1';

const INITIAL_POSTS: Post[] = [
    {
        id: 1,
        author: "李会计",
        avatarColor: "bg-blue-100 text-blue-600",
        date: "2025-11-08 10:30",
        tag: "不平分析类",
        tagColor: "bg-blue-50 text-blue-600",
        title: "科目 2001 往来账不平的常见诱因与解决路径",
        content: "在处理科目 2001 往来账不平问题时，发现几个高频诱因。首先要核查是否存在单边记账（仅借方或贷方有记录），其次需确认跨机构交易的对账周期是否同步... (展开全文)",
        likes: 45,
        comments: 12,
        favorites: 28
    },
    {
        id: 2,
        author: "赵会计",
        avatarColor: "bg-purple-100 text-purple-600",
        date: "2025-11-08 11:20",
        tag: "会计知识类",
        tagColor: "bg-purple-50 text-purple-600",
        title: "权责发生制在账务查询系统的智能应用解析",
        content: "权责发生制是账务准确性的基石，系统中是如何落地的？首先，系统会自动识别交易的权利/义务发生时点（而非资金收付时间）进行记账，其次在生成应收应付报表时会智能调整跨期项... (展开全文)",
        likes: 38,
        comments: 9,
        favorites: 22
    },
    {
        id: 3,
        author: "刘会计",
        avatarColor: "bg-green-100 text-green-600",
        date: "2025-11-08 14:00",
        tag: "系统使用类",
        tagColor: "bg-green-50 text-green-600",
        title: "账务查询系统 \"多维度筛选\" 功能的高效操作指南",
        content: "掌握系统的多维度筛选功能，能大幅提升查账效率。首先，可通过 \"科目 + 交易类型 + 金额区间\" 组合筛选定位异常交易，其次利用 \"时间轴穿透\" 功能追溯历史账务变动... (展开全文)",
        likes: 56,
        comments: 15,
        favorites: 41
    }
];

const loadDB = (): Post[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return INITIAL_POSTS;
        return JSON.parse(raw);
    } catch (e) {
        console.error("Failed to load posts", e);
        return INITIAL_POSTS;
    }
};

const saveDB = (items: Post[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

const delay = (ms: number = 300) => new Promise(resolve => setTimeout(resolve, ms));

export const communityService = {
    async listPosts(): Promise<Post[]> {
        await delay(200);
        const posts = loadDB();
        return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },

    async createPost(post: Omit<Post, 'id' | 'date' | 'likes' | 'comments' | 'favorites'>): Promise<Post> {
        await delay(500);
        const posts = loadDB();

        // Generate ID
        const maxId = posts.reduce((max, p) => (typeof p.id === 'number' ? Math.max(max, p.id) : max), 0);

        const newPost: Post = {
            ...post,
            id: maxId + 1,
            date: new Date().toISOString().replace('T', ' ').substring(0, 16), // Simple fake date format
            likes: 0,
            comments: 0,
            favorites: 0
        };

        posts.unshift(newPost);
        saveDB(posts);
        return newPost;
    },

    async deletePost(id: number | string): Promise<void> {
        await delay(300);
        const posts = loadDB();
        const updatedPosts = posts.filter(p => p.id !== id);
        saveDB(updatedPosts);
    }
};
