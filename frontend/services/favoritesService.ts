import { FavoriteItem, FavoriteRef, FavoriteMeta, FavoriteQuery, FavoriteType } from '../components/Favorites/types';

const STORAGE_KEY = 'favorites_db_v1';

// Internal helper to get all
const loadDB = (): FavoriteItem[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.error("Failed to load favorites", e);
        return [];
    }
};

const saveDB = (items: FavoriteItem[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

// Simulate async to allow future backend swap
const delay = (ms: number = 200) => new Promise(resolve => setTimeout(resolve, ms));

export const favoritesService = {

    async listFavorites(query?: FavoriteQuery, userId?: string): Promise<FavoriteItem[]> {
        // await delay(100); // Simulate network
        let items: FavoriteItem[] = [];

        // 1. Fetch from Backend if userId is present
        if (userId) {
            try {
                const { fetchFavorites, fetchSession } = await import('./backendService');
                const backendFavs = await fetchFavorites(userId);

                // Process Sessions
                if (backendFavs.sessions && Array.isArray(backendFavs.sessions)) {
                    const sessionPromises = backendFavs.sessions.map(async (sessionId: string) => {
                        try {
                            const session = await fetchSession(sessionId);
                            if (session) {
                                // Backend timestamps might be in seconds? server.py uses time.time() which is seconds (float)
                                const createdAt = (session.created_at || Date.now() / 1000) * 1000;
                                const updatedAt = (session.updated_at || Date.now() / 1000) * 1000;

                                return {
                                    type: 'CHAT_THREAD',
                                    id: session.id,
                                    title: session.title || '无标题对话',
                                    subtitle: 'AI 对话存档',
                                    summary: session.messages?.find((m: any) => m.role === 'user')?.content || '...',
                                    tags: ['对话'],
                                    createdAt: createdAt,
                                    updatedAt: updatedAt,
                                    actions: { canView: true, canExport: true }
                                } as FavoriteItem;
                            }
                        } catch (e) {
                            console.warn(`Failed to fetch session ${sessionId}`, e);
                        }
                        return null;
                    });

                    const fetchedSessions = (await Promise.all(sessionPromises)).filter(s => s !== null) as FavoriteItem[];
                    items = [...items, ...fetchedSessions];
                }

                // TODO: Handle KBs, Messages, Files from backend similarly

            } catch (e) {
                console.error("Failed to fetch backend favorites", e);
                // Fallback or just continue
            }
        }

        // Merge with local mock data (for types not yet on backend or if userId missing)
        const localItems = loadDB();
        // Avoid duplicates if IDs clash (unlikely given UUIDs)
        const itemIds = new Set(items.map(i => i.id));
        const nonDuplicateLocal = localItems.filter(i => !itemIds.has(i.id));
        items = [...items, ...nonDuplicateLocal];

        // 1. Sort by createdAt desc by default
        items.sort((a, b) => b.createdAt - a.createdAt);

        if (!query) return items;

        return items.filter(item => {
            // Type
            if (query.type && query.type !== 'ALL' && item.type !== query.type) return false;

            // Source Group
            if (query.source && query.source.length > 0) {
                const isChat = ['AI_ANSWER', 'CHAT_THREAD'].includes(item.type);
                const isKb = ['KNOWLEDGE_BASE', 'KB_ARTICLE'].includes(item.type);
                const matches = query.source.some(s => (s === 'CHAT' && isChat) || (s === 'KB' && isKb));
                if (!matches) return false;
            }

            // Search
            if (query.query) {
                const q = query.query.toLowerCase();
                const match = item.title.toLowerCase().includes(q) ||
                    (item.summary || '').toLowerCase().includes(q) ||
                    (item.tags || []).some(t => t.toLowerCase().includes(q));
                if (!match) return false;
            }

            // Tags
            if (query.tags && query.tags.length > 0) {
                const hasTag = query.tags.some(t => (item.tags || []).includes(t));
                if (!hasTag) return false;
            }

            return true;
        });
    },

    async isFavorited(ref: FavoriteRef): Promise<boolean> {
        const items = loadDB();
        return items.some(i => i.type === ref.type && i.id === ref.id);
    },

    // Returns true if added, false if removed
    async toggleFavorite(ref: FavoriteRef, meta?: FavoriteMeta): Promise<boolean> {
        await delay(200); // Simulate network latency
        const items = loadDB();
        const existingIdx = items.findIndex(i => i.type === ref.type && i.id === ref.id);

        if (existingIdx >= 0) {
            // Remove
            items.splice(existingIdx, 1);
            saveDB(items);
            return false;
        } else {
            // Add
            if (!meta) throw new Error("Meta required for new favorite");
            const newItem: FavoriteItem = {
                ...ref,
                ...meta,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            // Dedup just in case
            const finalItems = items.filter(i => !(i.type === ref.type && i.id === ref.id));
            finalItems.unshift(newItem);
            saveDB(finalItems);
            return true;
        }
    },

    async getFavorite(ref: FavoriteRef): Promise<FavoriteItem | null> {
        const items = loadDB();
        return items.find(i => i.type === ref.type && i.id === ref.id) || null;
    }
};
