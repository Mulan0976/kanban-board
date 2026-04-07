import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import type { Column, Task } from '../types';
import { getLinkColor, hexToRgba } from '../types';

// ============================================================
// Constants for layout calculation
// ============================================================
const DEFAULT_COLUMN_WIDTH = 300;
const COLUMN_HEADER_HEIGHT = 56;
const TASK_GAP = 8;
const TASK_PADDING = 8; // Column body padding
const ARROW_SIZE = 6;
const DOT_RADIUS = 4;

// ============================================================
// Estimate task card height based on content
// ============================================================
function estimateTaskHeight(task: Task): number {
  let height = 44; // Base: padding + title line

  // Content preview
  if (task.content) {
    height += 20;
  }

  // Checkpoints
  if (task.checkpoints.length > 0) {
    const visibleCheckpoints = Math.min(task.checkpoints.length, 8);
    height += 20 + visibleCheckpoints * 28; // 20px header + 28px per checkpoint
  }

  // Meta badges row (duration, time logs, dependencies, assignees)
  if (
    task.durationMinutes > 0 ||
    task.timeLogs.length > 0 ||
    task.dependencyIds.length > 0 ||
    task.assignees.length > 0
  ) {
    height += 24;
  }

  return height;
}

interface DependencyLinesProps {
  columns: Column[];
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
  containerRef: React.RefObject<HTMLDivElement>;
  highlightedTaskId: string | null;
  linkingFrom: { taskId: string; mouseX: number; mouseY: number } | null;
}

interface TaskPosition {
  taskId: string;
  columnId: string;
  centerX: number;
  centerY: number;
  leftX: number;
  rightX: number;
  topY: number;
  bottomY: number;
  columnX: number;
}

// ============================================================
// Calculate task positions from data
// ============================================================
function calculateTaskPositions(columns: Column[]): Map<string, TaskPosition> {
  const positions = new Map<string, TaskPosition>();

  for (const col of columns) {
    const colWidth = col.width || DEFAULT_COLUMN_WIDTH;
    // Only position non-completed tasks (completed ones are in the sidebar)
    const sortedTasks = [...col.tasks]
      .filter((t) => !t.completedAt)
      .sort((a, b) => a.position - b.position);

    let cumulativeY = col.y + COLUMN_HEADER_HEIGHT + TASK_PADDING;

    for (let i = 0; i < sortedTasks.length; i++) {
      const task = sortedTasks[i];
      const taskHeight = estimateTaskHeight(task);
      const taskTopY = cumulativeY;
      const taskBottomY = taskTopY + taskHeight;
      const taskCenterY = (taskTopY + taskBottomY) / 2;
      const taskCenterX = col.x + colWidth / 2;
      const leftX = col.x;
      const rightX = col.x + colWidth;

      positions.set(task.id, {
        taskId: task.id,
        columnId: col.id,
        centerX: taskCenterX,
        centerY: taskCenterY,
        leftX,
        rightX,
        topY: taskTopY,
        bottomY: taskBottomY,
        columnX: col.x,
      });

      cumulativeY = taskBottomY + TASK_GAP;
    }
  }

  return positions;
}

// ============================================================
// Bezier path calculation
// ============================================================
function createBezierPath(
  source: TaskPosition,
  target: TaskPosition
): string {
  const sameColumn = source.columnId === target.columnId;

  if (sameColumn) {
    // Route line on the left side of the column
    const offsetX = -30;
    const sx = source.leftX + offsetX;
    const sy = source.centerY;
    const tx = target.leftX + offsetX;
    const ty = target.centerY;

    const startX = source.leftX;
    const startY = source.centerY;
    const endX = target.leftX;
    const endY = target.centerY;

    return `M ${startX} ${startY} C ${sx} ${sy}, ${tx} ${ty}, ${endX} ${endY}`;
  }

  // Different columns: route from right side of source to left side of target
  const sourceOnLeft = source.columnX < target.columnX;

  let startX: number;
  let endX: number;

  if (sourceOnLeft) {
    startX = source.rightX;
    endX = target.leftX;
  } else {
    startX = source.leftX;
    endX = target.rightX;
  }

  const startY = source.centerY;
  const endY = target.centerY;

  const dx = Math.abs(endX - startX);
  const cpOffset = Math.max(50, dx * 0.4);

  const cp1x = sourceOnLeft ? startX + cpOffset : startX - cpOffset;
  const cp1y = startY;
  const cp2x = sourceOnLeft ? endX - cpOffset : endX + cpOffset;
  const cp2y = endY;

  return `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
}

// ============================================================
// Arrow marker definition
// ============================================================
function ArrowMarkerDef({ id, color }: { id: string; color: string }) {
  return (
    <marker
      id={id}
      viewBox={`0 0 ${ARROW_SIZE * 2} ${ARROW_SIZE * 2}`}
      refX={ARROW_SIZE * 2}
      refY={ARROW_SIZE}
      markerWidth={ARROW_SIZE}
      markerHeight={ARROW_SIZE}
      orient="auto-start-reverse"
    >
      <path
        d={`M 0 0 L ${ARROW_SIZE * 2} ${ARROW_SIZE} L 0 ${ARROW_SIZE * 2} Z`}
        fill={color}
      />
    </marker>
  );
}

// ============================================================
// DependencyLines Component
// ============================================================
function DependencyLines({
  columns,
  zoom,
  scrollLeft,
  scrollTop,
  containerRef,
  highlightedTaskId,
  linkingFrom,
}: DependencyLinesProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Track container dimensions
  useEffect(() => {
    const updateDimensions = () => {
      const container = containerRef.current;
      if (container) {
        setDimensions({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }
    };

    updateDimensions();

    const observer = new ResizeObserver(updateDimensions);
    const container = containerRef.current;
    if (container) {
      observer.observe(container);
    }

    return () => observer.disconnect();
  }, [containerRef]);

  // Calculate all task positions
  const taskPositions = useMemo(
    () => calculateTaskPositions(columns),
    [columns]
  );

  // Collect all dependency edges (skip if either task is completed)
  const edges = useMemo(() => {
    const result: {
      sourceId: string;
      targetId: string;
      source: TaskPosition;
      target: TaskPosition;
      color: string;
      isHighlighted: boolean;
    }[] = [];

    // Build a set of completed task IDs for quick lookup
    const completedIds = new Set<string>();
    for (const col of columns) {
      for (const task of col.tasks) {
        if (task.completedAt) completedIds.add(task.id);
      }
    }

    for (const col of columns) {
      for (const task of col.tasks) {
        if (task.dependencyIds.length === 0) continue;
        // Skip if this task is completed
        if (completedIds.has(task.id)) continue;

        const targetPos = taskPositions.get(task.id);
        if (!targetPos) continue;

        for (const depId of task.dependencyIds) {
          // Skip if the dependency is completed
          if (completedIds.has(depId)) continue;

          const sourcePos = taskPositions.get(depId);
          if (!sourcePos) continue;

          const isHighlighted =
            highlightedTaskId === task.id || highlightedTaskId === depId;

          // Unique color per target task (the one that depends)
          result.push({
            sourceId: depId,
            targetId: task.id,
            source: sourcePos,
            target: targetPos,
            color: getLinkColor(task.id),
            isHighlighted,
          });
        }
      }
    }

    return result;
  }, [columns, taskPositions, highlightedTaskId]);

  // Linking-from task position for temporary line
  const linkingFromPos = useMemo(() => {
    if (!linkingFrom) return null;
    return taskPositions.get(linkingFrom.taskId) || null;
  }, [linkingFrom, taskPositions]);

  // Collect unique marker colors
  const markerColors = useMemo(() => {
    const colors = new Set<string>();
    for (const edge of edges) {
      colors.add(edge.color);
    }
    return Array.from(colors);
  }, [edges]);

  // Don't render if there's nothing to draw
  if (edges.length === 0 && !linkingFrom) {
    return null;
  }

  const containerRect = containerRef.current?.getBoundingClientRect();
  const containerLeft = containerRect?.left ?? 0;
  const containerTop = containerRect?.top ?? 0;

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 z-10 pointer-events-none"
      style={{
        width: dimensions.width,
        height: dimensions.height,
        overflow: 'visible',
      }}
    >
      <defs>
        {/* Arrow markers for each unique color */}
        {markerColors.map((color) => (
          <ArrowMarkerDef
            key={`arrow-${color}`}
            id={`arrow-${color.replace('#', '')}`}
            color={color}
          />
        ))}
        {/* Default emerald for linking line */}
        <ArrowMarkerDef id="arrow-link" color="#22c55e" />
      </defs>

      {/* Dependency edges */}
      {edges.map((edge) => {
        // Transform from data-space to screen-space
        const transformX = (x: number) => x * zoom - scrollLeft;
        const transformY = (y: number) => y * zoom - scrollTop;

        const source: TaskPosition = {
          ...edge.source,
          centerX: transformX(edge.source.centerX),
          centerY: transformY(edge.source.centerY),
          leftX: transformX(edge.source.leftX),
          rightX: transformX(edge.source.rightX),
          topY: transformY(edge.source.topY),
          bottomY: transformY(edge.source.bottomY),
          columnX: transformX(edge.source.columnX),
        };

        const target: TaskPosition = {
          ...edge.target,
          centerX: transformX(edge.target.centerX),
          centerY: transformY(edge.target.centerY),
          leftX: transformX(edge.target.leftX),
          rightX: transformX(edge.target.rightX),
          topY: transformY(edge.target.topY),
          bottomY: transformY(edge.target.bottomY),
          columnX: transformX(edge.target.columnX),
        };

        const path = createBezierPath(source, target);
        const opacity = edge.isHighlighted ? 1.0 : 0.35;
        const strokeWidth = edge.isHighlighted ? 3 : 2;
        const markerId = `arrow-${edge.color.replace('#', '')}`;

        // Determine the start and end point for circle/arrow markers
        const sameColumn = edge.source.columnId === edge.target.columnId;
        let startX: number;
        let startY: number;
        let endX: number;
        let endY: number;

        if (sameColumn) {
          startX = source.leftX;
          startY = source.centerY;
          endX = target.leftX;
          endY = target.centerY;
        } else {
          const sourceOnLeft = edge.source.columnX < edge.target.columnX;
          startX = sourceOnLeft ? source.rightX : source.leftX;
          startY = source.centerY;
          endX = sourceOnLeft ? target.leftX : target.rightX;
          endY = target.centerY;
        }

        return (
          <g key={`${edge.sourceId}-${edge.targetId}`}>
            {/* Glow effect for highlighted */}
            {edge.isHighlighted && (
              <path
                d={path}
                fill="none"
                stroke={edge.color}
                strokeWidth={8}
                opacity={0.15}
                strokeLinecap="round"
              />
            )}

            {/* Main line */}
            <path
              d={path}
              fill="none"
              stroke={edge.color}
              strokeWidth={strokeWidth}
              opacity={opacity}
              strokeLinecap="round"
              markerEnd={`url(#${markerId})`}
            />

            {/* Source dot */}
            <circle
              cx={startX}
              cy={startY}
              r={edge.isHighlighted ? DOT_RADIUS + 1 : DOT_RADIUS}
              fill={edge.color}
              opacity={opacity}
            />

            {/* Highlight glow on source dot */}
            {edge.isHighlighted && (
              <circle
                cx={startX}
                cy={startY}
                r={DOT_RADIUS + 4}
                fill="none"
                stroke={edge.color}
                strokeWidth={2}
                opacity={0.3}
              />
            )}
          </g>
        );
      })}

      {/* Temporary linking line */}
      {linkingFrom && linkingFromPos && (() => {
        const transformX = (x: number) => x * zoom - scrollLeft;
        const transformY = (y: number) => y * zoom - scrollTop;

        const startX = transformX(linkingFromPos.rightX);
        const startY = transformY(linkingFromPos.centerY);

        // Mouse position is in screen coordinates relative to viewport.
        // We need to convert to SVG coordinates relative to the container.
        const endX = linkingFrom.mouseX - containerLeft;
        const endY = linkingFrom.mouseY - containerTop;

        const dx = Math.abs(endX - startX);
        const cpOffset = Math.max(40, dx * 0.3);

        const path = `M ${startX} ${startY} C ${startX + cpOffset} ${startY}, ${endX - cpOffset} ${endY}, ${endX} ${endY}`;

        return (
          <g>
            {/* Glow */}
            <path
              d={path}
              fill="none"
              stroke="#22c55e"
              strokeWidth={6}
              opacity={0.1}
              strokeLinecap="round"
            />

            {/* Dashed line */}
            <path
              d={path}
              fill="none"
              stroke="#22c55e"
              strokeWidth={2}
              strokeDasharray="8 4"
              opacity={0.6}
              strokeLinecap="round"
            >
              <animate
                attributeName="stroke-dashoffset"
                values="24;0"
                dur="1s"
                repeatCount="indefinite"
              />
            </path>

            {/* Source dot */}
            <circle
              cx={startX}
              cy={startY}
              r={DOT_RADIUS + 1}
              fill="#22c55e"
              opacity={0.8}
            />

            {/* Pulse on source */}
            <circle
              cx={startX}
              cy={startY}
              r={DOT_RADIUS + 4}
              fill="none"
              stroke="#22c55e"
              strokeWidth={2}
              opacity={0.4}
            >
              <animate
                attributeName="r"
                values={`${DOT_RADIUS + 2};${DOT_RADIUS + 8};${DOT_RADIUS + 2}`}
                dur="1.5s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.4;0.1;0.4"
                dur="1.5s"
                repeatCount="indefinite"
              />
            </circle>

            {/* Cursor dot */}
            <circle
              cx={endX}
              cy={endY}
              r={3}
              fill="#22c55e"
              opacity={0.6}
            />
          </g>
        );
      })()}
    </svg>
  );
}

export default React.memo(DependencyLines);
