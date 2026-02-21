'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#06060b]/80 backdrop-blur-xl border-b border-white/5'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto max-w-7xl px-6 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#8b5cf6] to-[#3b82f6] shadow-[0_0_20px_rgba(139,92,246,0.3)] group-hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] transition-shadow" />
          <span className="text-[15px] font-semibold tracking-tight text-white">
            Titan AI
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-[13px] text-[#a0a0b8]">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
          <a href="#protocol" className="hover:text-white transition-colors">Protocol</a>
          <a href="#download" className="hover:text-white transition-colors">Download</a>
        </div>

        <div className="flex items-center gap-4">
          <a
            href="#download"
            className="rounded-lg bg-gradient-to-r from-[#8b5cf6] to-[#3b82f6] px-5 py-2 text-[13px] font-medium text-white shadow-[0_0_20px_rgba(59,130,246,0.25)] hover:shadow-[0_0_30px_rgba(59,130,246,0.4)] transition-shadow"
          >
            Download
          </a>
        </div>
      </div>
    </nav>
  );
}
