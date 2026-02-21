'use client';

import { Navbar } from '@/components/landing/Navbar';
import { Hero } from '@/components/landing/Hero';
import { IDEMockup } from '@/components/landing/IDEMockup';
import { Features } from '@/components/landing/Features';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { ProtocolSpotlight } from '@/components/landing/ProtocolSpotlight';
import { DownloadSection } from '@/components/landing/DownloadSection';
import { Footer } from '@/components/landing/Footer';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#06060b] text-[#e6e6ef]">
      <Navbar />
      <Hero />
      <IDEMockup />
      <Features />
      <HowItWorks />
      <ProtocolSpotlight />
      <DownloadSection />
      <Footer />
    </main>
  );
}
