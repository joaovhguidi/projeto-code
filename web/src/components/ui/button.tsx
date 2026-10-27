import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'brand' | 'secondary' | 'ghost' | 'danger' | 'subtle' | 'link';
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary: 'bg-accent-400 text-ink-950 hover:bg-accent-300 active:bg-accent-500 shadow-[inset_0_-1px_0_rgb(0_0_0/0.08)] font-semibold',
  brand: 'bg-brand-800 text-white hover:bg-brand-700 active:bg-brand-900 font-semibold',
  secondary: 'bg-white text-ink-800 border border-ink-200 hover:bg-ink-50 hover:border-ink-300 font-medium',
  ghost: 'text-ink-700 hover:bg-ink-100 font-medium',
  subtle: 'bg-brand-50 text-brand-800 hover:bg-brand-100 font-medium',
  danger: 'bg-red-600 text-white hover:bg-red-700 font-semibold',
  link: 'text-brand-700 hover:text-brand-800 underline-offset-4 hover:underline font-medium px-0',
};
const sizes: Record<Size, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1 rounded-md',
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-6 text-base gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...props }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn('inline-flex items-center justify-center whitespace-nowrap transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none select-none',
        variants[variant], sizes[size], className)}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});
