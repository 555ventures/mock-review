import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <button
      ref={ref}
      data-slot="button"
      className={cn('btn', variant === 'outline' ? 'btn-outline' : null, className)}
      {...props}
    />
  ),
)
Button.displayName = 'Button'
