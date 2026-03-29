
export type FavoriteType = 'AI_ANSWER' | 'CHAT_THREAD' | 'KNOWLEDGE_BASE' | 'KB_ARTICLE' | 'COMMUNITY_POST';

export interface FavoriteRef {
    type: FavoriteType;
    id: string; // The unique ID of the target
}

export interface FavoriteMeta {
    title: string;
    subtitle?: string;
    summary?: string;
    tags?: string[];
    sourceId?: string;
    extra?: any;
    // Optional cached access control or content
    actions?: {
        canView: boolean;
        canEdit?: boolean;
        canExport?: boolean;
    };
    content?: string; // Optional cached content (short) or markdown
}

export interface FavoriteItem extends FavoriteRef, FavoriteMeta {
    createdAt: number;
    updatedAt: number;
}

export interface FavoriteQuery {
    type?: FavoriteType | 'ALL';
    query?: string;
    tags?: string[];
    source?: ('CHAT' | 'KB')[];
}

export interface FilterState {
    type: FavoriteType | 'ALL';
    source: string[];
    tags: string[];
    dateRange: { start: string; end: string } | null;
    onlyViewable: boolean;
}
