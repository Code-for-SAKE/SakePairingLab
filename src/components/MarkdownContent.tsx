import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { clsx } from 'clsx';

interface MarkdownContentProps {
  /** マークダウン形式の文字列 */
  children: string;
  /** ライト背景用 (default) / ダーク背景用 */
  variant?: 'light' | 'dark';
  /** 追加クラス */
  className?: string;
}

/**
 * マークダウン文字列を整形して表示するコンポーネント。
 * react-markdown + remark-gfm + @tailwindcss/typography を使用。
 */
export function MarkdownContent({ children, variant = 'light', className }: MarkdownContentProps) {
  return (
    <div
      className={clsx(
        'prose prose-sm max-w-none',
        variant === 'dark'
          ? 'prose-invert prose-p:text-slate-300 prose-headings:text-purple-300 prose-strong:text-white prose-li:text-slate-300 prose-hr:border-slate-700'
          : 'prose-slate',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
