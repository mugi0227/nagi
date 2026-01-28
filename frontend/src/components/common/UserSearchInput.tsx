import { useCallback, useEffect, useRef, useState } from 'react';
import { usersApi, UserSearchResult } from '../../api/users';
import { resolveDisplayName } from '../../utils/displayName';
import './UserSearchInput.css';

interface UserSearchInputProps {
    onSelect: (user: UserSearchResult) => void;
    placeholder?: string;
    disabled?: boolean;
}

export function UserSearchInput({
    onSelect,
    placeholder = 'ユーザー名またはメールで検索...',
    disabled = false,
}: UserSearchInputProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<UserSearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const searchUsers = useCallback(async (searchQuery: string) => {
        if (searchQuery.length < 1) {
            setResults([]);
            setIsOpen(false);
            return;
        }

        setIsLoading(true);
        try {
            const data = await usersApi.search(searchQuery, 10);
            setResults(data);
            setIsOpen(data.length > 0);
            setHighlightIndex(-1);
        } catch (err) {
            console.error('User search failed:', err);
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(() => {
            searchUsers(query);
        }, 300);

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [query, searchUsers]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (user: UserSearchResult) => {
        onSelect(user);
        setQuery('');
        setResults([]);
        setIsOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen || results.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        } else if (e.key === 'Enter' && highlightIndex >= 0) {
            e.preventDefault();
            handleSelect(results[highlightIndex]);
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    };

    const getDisplayNameForUser = (user: UserSearchResult) => {
        return resolveDisplayName({
            displayName: user.display_name,
            userId: user.id,
        });
    };

    return (
        <div className="user-search-input" ref={containerRef}>
            <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => results.length > 0 && setIsOpen(true)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                className="user-search-field"
            />
            {isLoading && <span className="user-search-loading">...</span>}

            {isOpen && results.length > 0 && (
                <ul className="user-search-dropdown">
                    {results.map((user, index) => (
                        <li
                            key={user.id}
                            className={`user-search-item ${index === highlightIndex ? 'highlighted' : ''}`}
                            onClick={() => handleSelect(user)}
                            onMouseEnter={() => setHighlightIndex(index)}
                        >
                            <div className="user-search-item-main">
                                <span className="user-search-name">{getDisplayNameForUser(user)}</span>
                                {user.username && user.display_name && (
                                    <span className="user-search-username">@{user.username}</span>
                                )}
                            </div>
                            {user.email && (
                                <span className="user-search-email">{user.email}</span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
