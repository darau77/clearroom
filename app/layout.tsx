import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Clearroom — Practise the conversation', description: 'A little rehearsal for the conversations that matter. Practise difficult workplace moments, reflect, and try again.', icons: { icon: '/favicon.svg' } };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
