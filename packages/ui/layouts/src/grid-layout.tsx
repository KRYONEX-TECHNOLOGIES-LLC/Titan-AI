// Grid Layout Component
// packages/ui/layouts/src/grid-layout.tsx

import React from 'react';
import { clsx } from 'clsx';

export interface GridLayoutProps {
  children: React.ReactNode;
  columns?: number | string;
  rows?: number | string;
  gap?: number | string;
  columnGap?: number | string;
  rowGap?: number | string;
  className?: string;
}

export function GridLayout({
  children,
  columns = 'auto',
  rows = 'auto',
  gap,
  columnGap,
  rowGap,
  className,
}: GridLayoutProps) {
  const gridTemplateColumns = typeof columns === 'number'
    ? `repeat(${columns}, 1fr)`
    : columns;

  const gridTemplateRows = typeof rows === 'number'
    ? `repeat(${rows}, 1fr)`
    : rows;

  return (
    <div
      className={clsx('titan-grid-layout grid', className)}
      style={{
        gridTemplateColumns,
        gridTemplateRows,
        gap,
        columnGap,
        rowGap,
      }}
    >
      {children}
    </div>
  );
}

export interface GridItemProps {
  children: React.ReactNode;
  colSpan?: number;
  rowSpan?: number;
  colStart?: number;
  colEnd?: number;
  rowStart?: number;
  rowEnd?: number;
  className?: string;
}

export function GridItem({
  children,
  colSpan,
  rowSpan,
  colStart,
  colEnd,
  rowStart,
  rowEnd,
  className,
}: GridItemProps) {
  return (
    <div
      className={clsx('titan-grid-item', className)}
      style={{
        gridColumn: colSpan ? `span ${colSpan}` : colStart && colEnd ? `${colStart} / ${colEnd}` : undefined,
        gridRow: rowSpan ? `span ${rowSpan}` : rowStart && rowEnd ? `${rowStart} / ${rowEnd}` : undefined,
      }}
    >
      {children}
    </div>
  );
}

export interface FlexLayoutProps {
  children: React.ReactNode;
  direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  wrap?: 'wrap' | 'nowrap' | 'wrap-reverse';
  justify?: 'start' | 'end' | 'center' | 'between' | 'around' | 'evenly';
  align?: 'start' | 'end' | 'center' | 'stretch' | 'baseline';
  gap?: number | string;
  className?: string;
}

export function FlexLayout({
  children,
  direction = 'row',
  wrap = 'nowrap',
  justify = 'start',
  align = 'stretch',
  gap,
  className,
}: FlexLayoutProps) {
  const justifyClasses = {
    start: 'justify-start',
    end: 'justify-end',
    center: 'justify-center',
    between: 'justify-between',
    around: 'justify-around',
    evenly: 'justify-evenly',
  };

  const alignClasses = {
    start: 'items-start',
    end: 'items-end',
    center: 'items-center',
    stretch: 'items-stretch',
    baseline: 'items-baseline',
  };

  const directionClasses = {
    row: 'flex-row',
    column: 'flex-col',
    'row-reverse': 'flex-row-reverse',
    'column-reverse': 'flex-col-reverse',
  };

  const wrapClasses = {
    wrap: 'flex-wrap',
    nowrap: 'flex-nowrap',
    'wrap-reverse': 'flex-wrap-reverse',
  };

  return (
    <div
      className={clsx(
        'titan-flex-layout flex',
        directionClasses[direction],
        wrapClasses[wrap],
        justifyClasses[justify],
        alignClasses[align],
        className
      )}
      style={{ gap }}
    >
      {children}
    </div>
  );
}

export interface FlexItemProps {
  children: React.ReactNode;
  grow?: number;
  shrink?: number;
  basis?: number | string;
  order?: number;
  alignSelf?: 'auto' | 'start' | 'end' | 'center' | 'stretch' | 'baseline';
  className?: string;
}

export function FlexItem({
  children,
  grow = 0,
  shrink = 1,
  basis = 'auto',
  order,
  alignSelf,
  className,
}: FlexItemProps) {
  const alignSelfClasses = {
    auto: 'self-auto',
    start: 'self-start',
    end: 'self-end',
    center: 'self-center',
    stretch: 'self-stretch',
    baseline: 'self-baseline',
  };

  return (
    <div
      className={clsx(
        'titan-flex-item',
        alignSelf && alignSelfClasses[alignSelf],
        className
      )}
      style={{
        flexGrow: grow,
        flexShrink: shrink,
        flexBasis: basis,
        order,
      }}
    >
      {children}
    </div>
  );
}

export interface StackLayoutProps {
  children: React.ReactNode;
  spacing?: number | string;
  direction?: 'vertical' | 'horizontal';
  align?: 'start' | 'center' | 'end' | 'stretch';
  className?: string;
}

export function StackLayout({
  children,
  spacing = 8,
  direction = 'vertical',
  align = 'stretch',
  className,
}: StackLayoutProps) {
  return (
    <FlexLayout
      direction={direction === 'vertical' ? 'column' : 'row'}
      align={align}
      gap={spacing}
      className={className}
    >
      {children}
    </FlexLayout>
  );
}

export interface CenterLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function CenterLayout({ children, className }: CenterLayoutProps) {
  return (
    <div
      className={clsx(
        'titan-center-layout',
        'flex items-center justify-center h-full w-full',
        className
      )}
    >
      {children}
    </div>
  );
}

export interface AspectRatioLayoutProps {
  children: React.ReactNode;
  ratio: number;
  className?: string;
}

export function AspectRatioLayout({
  children,
  ratio,
  className,
}: AspectRatioLayoutProps) {
  return (
    <div
      className={clsx('titan-aspect-ratio-layout relative w-full', className)}
      style={{ paddingBottom: `${(1 / ratio) * 100}%` }}
    >
      <div className="absolute inset-0">
        {children}
      </div>
    </div>
  );
}

export interface ScrollAreaProps {
  children: React.ReactNode;
  direction?: 'vertical' | 'horizontal' | 'both';
  className?: string;
}

export function ScrollArea({
  children,
  direction = 'vertical',
  className,
}: ScrollAreaProps) {
  const scrollClasses = {
    vertical: 'overflow-y-auto overflow-x-hidden',
    horizontal: 'overflow-x-auto overflow-y-hidden',
    both: 'overflow-auto',
  };

  return (
    <div
      className={clsx(
        'titan-scroll-area',
        scrollClasses[direction],
        'scrollbar-thin scrollbar-thumb-scrollbar scrollbar-track-transparent',
        className
      )}
    >
      {children}
    </div>
  );
}
