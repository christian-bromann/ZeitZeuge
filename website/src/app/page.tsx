import { Hero } from '@/components/hero';
import { Features } from '@/components/features';
import { HowItWorks } from '@/components/how-it-works';
import { WhatItFinds } from '@/components/what-it-finds';
import { QuickStart } from '@/components/quick-start';

export default function Home() {
  return (
    <>
      <Hero />
      <Features />
      <HowItWorks />
      <WhatItFinds />
      <QuickStart />
    </>
  );
}
