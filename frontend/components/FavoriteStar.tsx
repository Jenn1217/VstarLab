import React, { useState, useEffect, useCallback } from 'react';
import { Star, Loader2 } from 'lucide-react';
import { favoritesService } from '../services/favoritesService';
import { FavoriteRef, FavoriteMeta } from './Favorites/types';

interface FavoriteStarProps {
    favoriteRef: FavoriteRef;
    meta?: FavoriteMeta; // Required when toggling ON
    className?: string;
    size?: number;
}

export const FavoriteStar: React.FC<FavoriteStarProps> = ({ favoriteRef, meta, className, size = 18 }) => {
    const [isFavorited, setIsFavorited] = useState(false);
    const [loading, setLoading] = useState(true);
    const [operating, setOperating] = useState(false);

    // Check initial status
    useEffect(() => {
        let mounted = true;
        favoritesService.isFavorited(favoriteRef).then(status => {
            if (mounted) {
                setIsFavorited(status);
                setLoading(false);
            }
        });
        return () => { mounted = false; };
    }, [favoriteRef.id, favoriteRef.type]);

    const handleToggle = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (operating) return;

        // Optimistic Update
        const previousState = isFavorited;
        setIsFavorited(!previousState);
        setOperating(true);

        try {
            if (!previousState && !meta) {
                console.error("Meta is missing for adding favorite");
                // Revert immediately if we can't save
                setIsFavorited(previousState);
                alert("无法收藏：缺少元数据");
                return;
            }

            await favoritesService.toggleFavorite(favoriteRef, meta);
            // Success - state already updated optimistically
        } catch (err) {
            console.error("Favorite toggle failed", err);
            // Rollback
            setIsFavorited(previousState);
            alert("收藏操作失败，请重试");
        } finally {
            setOperating(false);
        }
    };

    if (loading) return <div className={`animate-pulse bg-slate-200 rounded-full w-[${size}px] h-[${size}px]`} />;

    return (
        <button
            onClick={handleToggle}
            disabled={operating}
            className={`relative transition-all hover:scale-110 active:scale-95 ${className || ''} ${operating ? 'opacity-70 cursor-wait' : ''}`}
            title={isFavorited ? "取消收藏" : "收藏"}
        >
            <Star
                size={size}
                className={`transition-colors duration-300 ${isFavorited ? 'text-[#ffb700] fill-[#ffb700]' : 'text-slate-300 hover:text-[#ffb700]'}`}
            />
        </button>
    );
};
