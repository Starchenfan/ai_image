"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-paper)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 active:translate-y-px select-none",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-accent-ink hover:bg-[color:var(--color-accent)]/90",
        secondary:
          "bg-paper-3 text-ink hover:bg-paper-4 border border-line",
        ghost: "text-ink-2 hover:text-ink hover:bg-paper-3",
        outline:
          "border border-line text-ink hover:bg-paper-3 hover:border-[color:var(--color-line)]",
        danger: "bg-danger text-white hover:opacity-90",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-sm px-3 text-xs",
        lg: "h-11 rounded-lg px-6 text-base",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8 rounded-sm",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
