import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		fontFamily: {
			display: ['"Big Shoulders Variable"', '"Big Shoulders"', '"Arial Narrow"', 'sans-serif'],
			sans: ['"Inter Variable"', '"Inter Fallback"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
			mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
		},
		extend: {
			colors: {
				/* ── Semantic design tokens ── */
				/* redesign.md §1 tokens, mapped so there is ONE system: prefer the shadcn names
				   (bg-background, bg-card, text-muted-foreground, bg-primary…); these add what shadcn lacks.
				   AA-checked values live in src/index.css. */
				coral: {
					DEFAULT: 'var(--accent-primary)',
					hover: 'var(--accent-hover)',
					fg: 'var(--accent-fg)',        /* text on coral (white light / ink dark) */
					decor: 'var(--coral-decor)',   /* decoration only, never text */
					muted: 'var(--accent-muted)',
					bg: 'var(--accent-bg)',
				},
				surface: {
					base: 'var(--bg-primary)',
					secondary: 'var(--bg-secondary)',
					elevated: 'var(--bg-elevated)',
				},
				glass: 'var(--bg-glass)',
				seat: {
					premium: 'rgb(var(--seat-premium) / <alpha-value>)',
					standard: 'rgb(var(--seat-standard) / <alpha-value>)',
					economy: 'rgb(var(--seat-economy) / <alpha-value>)',
				},
				success: 'hsl(var(--success) / <alpha-value>)',
				warning: 'hsl(var(--warning) / <alpha-value>)',
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				}
			},
			/* Type scale (redesign.md §2). Pair with font-display / font-sans / font-mono. */
			fontSize: {
				display: ['clamp(2.5rem, 6vw, 4.5rem)', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
				section: ['clamp(1.75rem, 3vw, 2.5rem)', { lineHeight: '1.2', fontWeight: '600' }],
				'card-title': ['1.25rem', { lineHeight: '1.4', fontWeight: '600' }],
				label: ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '0.05em', fontWeight: '500' }],
				data: ['1.125rem', { lineHeight: '1.5rem', fontWeight: '700' }],
				'data-lg': ['1.5rem', { lineHeight: '2rem', fontWeight: '700' }],
			},
			borderRadius: {
				'2xl': '1rem',
				xl: '0.875rem',
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: { height: '0' },
					to: { height: 'var(--radix-accordion-content-height)' }
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: '0' }
				},
				'shimmer-slide': {
					from: { backgroundPosition: '-200% 0' },
					to:   { backgroundPosition: '200% 0' }
				},
				'float': {
					'0%, 100%': { transform: 'translateY(0px)' },
					'50%': { transform: 'translateY(-10px)' }
				},
				'fade-in': {
					from: { opacity: '0' },
					to:   { opacity: '1' }
				},
				'fade-in-up': {
					from: { opacity: '0', transform: 'translateY(20px)' },
					to:   { opacity: '1', transform: 'translateY(0)' }
				},
				'scale-in': {
					from: { opacity: '0', transform: 'scale(0.94)' },
					to:   { opacity: '1', transform: 'scale(1)' }
				},
				'slide-bar': {
					'0%':   { transform: 'translateX(-100%)' },
					'100%': { transform: 'translateX(300%)' }
				},
				'fadeIn': {
					from: { opacity: '0', transform: 'translateY(10px)' },
					to:   { opacity: '1', transform: 'translateY(0)' }
				},
				'fadeInScale': {
					from: { opacity: '0', transform: 'scale(0.96) translateY(8px)' },
					to:   { opacity: '1', transform: 'scale(1) translateY(0)' }
				},
				'shimmer': {
					'0%':   { backgroundPosition: '-200% 0' },
					'100%': { backgroundPosition: '200% 0' }
				},
				'seat-pop': {
					'0%':   { transform: 'scale(0.86)' },
					'100%': { transform: 'scale(1)' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'shimmer-slide': 'shimmer-slide 1.6s ease-in-out infinite',
				'float': 'float 5s ease-in-out infinite',
				'fade-in': 'fade-in 0.4s ease-out both',
				'fade-in-up': 'fade-in-up 0.5s cubic-bezier(0.22,1,0.36,1) both',
				'scale-in': 'scale-in 0.35s cubic-bezier(0.22,1,0.36,1) both',
				'slide-bar': 'slide-bar 1.5s ease-in-out infinite',
				'fadeIn': 'fadeIn 0.45s cubic-bezier(0.22,1,0.36,1) both',
				'fadeInScale': 'fadeInScale 0.4s cubic-bezier(0.22,1,0.36,1) both',
				'shimmer': 'shimmer 1.8s linear infinite',
				/* Seat map: a seat being picked settles with a tiny overshoot (disabled under reduced motion). */
				'seat-pop': 'seat-pop 220ms cubic-bezier(0.34,1.56,0.64,1)'
			}
		}
	},
	plugins: [tailwindcssAnimate],
} satisfies Config;
