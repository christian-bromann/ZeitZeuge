import { ImageResponse } from 'next/og';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

const COLORS = {
  bg: '#09090b',
  bgLight: '#161618',
  text: '#f5f5f5',
  textMuted: '#a3a3a3',
  primary: '#22d3ee',
  primaryDim: 'rgba(34, 211, 238, 0.15)',
};

const mascotBytes = readFileSync(join(process.cwd(), 'public', 'zeitzeuge.png'));
const mascotSrc = `data:image/png;base64,${Buffer.from(mascotBytes).toString('base64')}`;

export async function GET(request: NextRequest): Promise<ImageResponse> {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title') || 'zeitzeuge';
  const description = searchParams.get('description') || 'AI-Powered Performance Analysis';

  const displayTitle = title.length > 48 ? title.slice(0, 45) + '...' : title;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: COLORS.bg,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Radial glow behind mascot */}
      <div
        style={{
          position: 'absolute',
          right: '-60px',
          top: '-60px',
          width: '700px',
          height: '700px',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(34, 211, 238, 0.12) 0%, rgba(34, 211, 238, 0.04) 40%, transparent 70%)',
          display: 'flex',
        }}
      />

      {/* Subtle grid dots */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          display: 'flex',
        }}
      />

      {/* Content area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          width: '100%',
          height: '100%',
          padding: '60px',
        }}
      >
        {/* Left: text content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flex: 1,
            paddingRight: '40px',
          }}
        >
          {/* Accent bar */}
          <div
            style={{
              width: '72px',
              height: '6px',
              background: COLORS.primary,
              borderRadius: '3px',
              marginBottom: '36px',
              display: 'flex',
            }}
          />

          {/* Title */}
          <div
            style={{
              fontSize: title === 'zeitzeuge' ? '100px' : '80px',
              fontWeight: 700,
              color: COLORS.text,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              marginBottom: '24px',
              display: 'flex',
            }}
          >
            {displayTitle}
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: '36px',
              color: COLORS.textMuted,
              lineHeight: 1.4,
              display: 'flex',
              maxWidth: '600px',
            }}
          >
            {description}
          </div>

          {/* Powered by badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginTop: '40px',
              fontSize: '24px',
              color: COLORS.primary,
              letterSpacing: '0.05em',
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            zeitzeuge.dev
          </div>
        </div>

        {/* Right: mascot */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '380px',
            height: '380px',
            flexShrink: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mascotSrc}
            alt="zeitzeuge mascot"
            width={360}
            height={360}
            style={{
              borderRadius: '24px',
              objectFit: 'contain',
            }}
          />
        </div>
      </div>

      {/* Bottom border accent */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: `linear-gradient(to right, ${COLORS.primary}, transparent)`,
          display: 'flex',
        }}
      />
    </div>,
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
    },
  );
}
