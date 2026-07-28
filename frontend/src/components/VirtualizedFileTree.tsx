/**
 * VirtualizedFileTree.tsx
 * ~~~~~~~~~~~~~~~~~~~~~~~
 * A viewport-only file navigator for the RepoSage dashboard.
 *
 * Uses @tanstack/react-virtual to render ONLY the rows currently visible in
 * the scroll viewport, keeping DOM node count ~constant (~20-30 nodes) even
 * when the repository has hundreds of files.
 *
 * Visual output is pixel-identical to the original inline recursive renderer
 * in Dashboard.tsx (same icons, colours, padding-depth formula, hover states).
 */

import React, { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types — kept local; Dashboard.tsx re-exports them if needed
// ---------------------------------------------------------------------------
export interface FileTreeNode {
  name: string;
  fullPath: string;
  isFolder: boolean;
  children: FileTreeNode[];
}

interface FlatNode {
  node: FileTreeNode;
  depth: number;
}

interface VirtualizedFileTreeProps {
  /** The nested tree produced by buildFileTree() in Dashboard.tsx */
  fileTreeData: FileTreeNode[];
  /** Set of expanded folder fullPaths */
  expandedFolders: Set<string>;
  /** The currently selected file's fullPath */
  selectedFile: string | null;
  /** Toggle a folder open/closed */
  toggleFolder: (path: string) => void;
  /** Select a file for review */
  setSelectedFile: (path: string) => void;
}

// ---------------------------------------------------------------------------
// Tree flattening — runs synchronously on the main thread for the initial
// render. For very large trees (300+ items) the diffParser.worker.js
// FLATTEN_TREE message can pre-compute this off-thread.
// ---------------------------------------------------------------------------
function flattenTree(
  nodes: FileTreeNode[],
  expandedFolders: Set<string>,
  depth = 0,
  result: FlatNode[] = []
): FlatNode[] {
  for (const node of nodes) {
    result.push({ node, depth });
    if (node.isFolder && expandedFolders.has(node.fullPath) && node.children.length > 0) {
      flattenTree(node.children, expandedFolders, depth + 1, result);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const ITEM_HEIGHT = 30; // px — matches original 5px padding top+bottom + 20px line

export const VirtualizedFileTree: React.FC<VirtualizedFileTreeProps> = ({
  fileTreeData,
  expandedFolders,
  selectedFile,
  toggleFolder,
  setSelectedFile,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Flat ordered list of visible nodes — recomputed only when tree data or
  // expanded state changes.
  const flatItems = useMemo(
    () => flattenTree(fileTreeData, expandedFolders),
    [fileTreeData, expandedFolders]
  );

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 12, // render 12 extra rows above/below viewport for smooth scroll
  });

  if (flatItems.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '24px 10px',
          color: 'var(--subtext-color)',
          fontSize: '11px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <span>🚫 No matching files found</span>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      style={{
        height: '60vh',
        overflowY: 'auto',
        position: 'relative',
      }}
    >
      {/* Single tall inner div — the virtualizer positions rows absolutely inside it */}
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const { node, depth } = flatItems[virtualRow.index];
          const paddingLeft = 8 + depth * 14;
          const isSelected = selectedFile === node.fullPath;

          if (node.isFolder) {
            const isExpanded = expandedFolders.has(node.fullPath);
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <button
                  onClick={() => toggleFolder(node.fullPath)}
                  style={{
                    width: '100%',
                    padding: '5px 8px',
                    paddingLeft: `${paddingLeft}px`,
                    borderRadius: '4px',
                    background: 'transparent',
                    border: '1px solid transparent',
                    color: '#d1d5db',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    transition: 'all 0.15s',
                    boxSizing: 'border-box',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} folder ${node.name}`}
                >
                  {isExpanded ? (
                    <ChevronDown size={12} style={{ color: '#9ca3af', flexShrink: 0 }} />
                  ) : (
                    <ChevronRight size={12} style={{ color: '#9ca3af', flexShrink: 0 }} />
                  )}
                  {isExpanded ? (
                    <FolderOpen size={14} style={{ color: '#60a5fa', flexShrink: 0 }} />
                  ) : (
                    <Folder size={14} style={{ color: '#60a5fa', flexShrink: 0 }} />
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {node.name}
                  </span>
                </button>
              </div>
            );
          }

          // File node
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <button
                onClick={() => setSelectedFile(node.fullPath)}
                style={{
                  width: '100%',
                  padding: '5px 8px',
                  paddingLeft: `${paddingLeft}px`,
                  borderRadius: '4px',
                  background: isSelected ? 'rgba(59,130,246,0.1)' : 'transparent',
                  border: isSelected
                    ? '1px solid rgba(59,130,246,0.3)'
                    : '1px solid transparent',
                  color: isSelected ? '#60a5fa' : 'var(--text-color)',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: isSelected ? 600 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                  boxSizing: 'border-box',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'transparent';
                }}
                aria-current={isSelected ? 'true' : undefined}
                aria-label={`Select file ${node.name}`}
              >
                <FileCode
                  size={14}
                  style={{
                    color: isSelected ? '#60a5fa' : 'var(--subtext-color)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {node.name}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VirtualizedFileTree;
