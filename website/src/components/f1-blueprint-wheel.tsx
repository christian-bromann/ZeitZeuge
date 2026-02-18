'use client';

export function F1BlueprintWheel() {
  return (
    <div
      className="mx-auto w-full max-w-[280px] sm:max-w-[400px] lg:max-w-[520px]"
      style={{ aspectRatio: '500 / 350' }}
    >
      <svg
        viewBox="0 0 500 350"
        role="img"
        aria-label="Formula 1 steering wheel blueprint illustration — AI-Powered Performance Analysis"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
        fill="none"
      >
        <defs>
          <style>{cssStyles}</style>
          <pattern id="bp-grid" width="25" height="25" patternUnits="userSpaceOnUse">
            <path
              d="M 25 0 L 0 0 0 25"
              stroke="var(--border-subtle)"
              strokeWidth="0.5"
              strokeDasharray="2 3"
              fill="none"
            />
          </pattern>
        </defs>

        {/* Background Grid */}
        <rect
          width="500"
          height="350"
          fill="url(#bp-grid)"
          className="f1-grid"
          aria-hidden="true"
        />

        {/* Blueprint frame border */}
        <rect
          x={5}
          y={5}
          width={490}
          height={340}
          stroke="var(--primary)"
          strokeWidth="0.3"
          opacity="0.15"
          className="f1-draw"
          style={{ '--len': '1660', '--d': '0s' } as React.CSSProperties}
          aria-hidden="true"
        />

        {/* Paddle Shifters — thin flat horizontal levers behind the wheel */}
        <g aria-hidden="true">
          {/* Left paddle — thin closed shape extending LEFT */}
          <path
            className="f1-draw"
            style={{ '--len': '400', '--d': '0.5s' } as React.CSSProperties}
            d="M 160 80 L 72 62 Q 56 59 55 65 Q 54 71 70 70 L 155 84 Z"
            stroke="var(--primary)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          {/* Right paddle — thin closed shape extending RIGHT */}
          <path
            className="f1-draw"
            style={{ '--len': '400', '--d': '0.5s' } as React.CSSProperties}
            d="M 340 80 L 428 62 Q 444 59 445 65 Q 446 71 430 70 L 345 84 Z"
            stroke="var(--primary)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </g>

        {/*
          Wheel Silhouette — ONE continuous closed path
          Plate + grips as a single outline. No loose lines.
          Clockwise from top-left of face plate.
        */}
        <path
          className="f1-draw"
          style={{ '--len': '1600', '--d': '0s' } as React.CSSProperties}
          d={[
            'M 178 82',
            'L 212 82',
            'L 212 50',
            'Q 212 38 226 38',
            'L 274 38',
            'Q 288 38 288 50',
            'L 288 82',
            'L 322 82',
            'Q 348 82 348 108',
            'L 348 142',
            'L 376 130',
            'L 400 136',
            'L 416 158',
            'L 424 185',
            'L 424 210',
            'L 416 236',
            'L 400 256',
            'L 376 264',
            'L 348 252',
            'L 348 274',
            'Q 348 296 322 296',
            'L 178 296',
            'Q 152 296 152 274',
            'L 152 252',
            'L 124 264',
            'L 100 256',
            'L 84 236',
            'L 76 210',
            'L 76 185',
            'L 84 158',
            'L 100 136',
            'L 124 130',
            'L 152 142',
            'L 152 108',
            'Q 152 82 178 82',
            'Z',
          ].join(' ')}
          stroke="var(--primary)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          aria-hidden="true"
        />

        {/* Grip inner contour lines (within the silhouette, anchored to plate edge) */}
        <g className="f1-fade" style={{ '--d': '0.6s' } as React.CSSProperties} aria-hidden="true">
          {/* Left grip inner contour */}
          <path
            d="M 152 152 L 132 142 L 112 148 L 100 164 L 92 188 L 92 208 L 100 230 L 114 246 L 134 252 L 152 244"
            stroke="var(--primary)"
            strokeWidth="0.5"
            strokeLinejoin="round"
            opacity="0.35"
          />
          {/* Right grip inner contour */}
          <path
            d="M 348 152 L 368 142 L 388 148 L 400 164 L 408 188 L 408 208 L 400 230 L 386 246 L 366 252 L 348 244"
            stroke="var(--primary)"
            strokeWidth="0.5"
            strokeLinejoin="round"
            opacity="0.35"
          />
        </g>

        {/* Column center crosshair */}
        <g className="f1-fade" style={{ '--d': '0.4s' } as React.CSSProperties} aria-hidden="true">
          <line
            x1={245}
            y1={38}
            x2={255}
            y2={38}
            stroke="var(--primary)"
            strokeWidth="0.5"
            opacity="0.3"
          />
          <line
            x1={250}
            y1={33}
            x2={250}
            y2={43}
            stroke="var(--primary)"
            strokeWidth="0.5"
            opacity="0.3"
          />
        </g>

        {/* LED Indicator Strip */}
        <g className="f1-fade" style={{ '--d': '0.8s' } as React.CSSProperties} aria-hidden="true">
          {Array.from({ length: 15 }, (_, i) => (
            <circle
              key={i}
              cx={Math.round(178 + i * (144 / 14))}
              cy={93}
              r={2.8}
              fill="var(--primary)"
              className="f1-led"
              style={
                { '--led-d': `${(3 + Math.abs(i - 7) * 0.12).toFixed(2)}s` } as React.CSSProperties
              }
            />
          ))}
        </g>

        {/* Central Display */}
        <rect
          x={186}
          y={126}
          width={128}
          height={88}
          rx={3}
          fill="var(--primary)"
          fillOpacity={0.08}
          stroke="var(--primary)"
          strokeWidth="1"
          className="f1-draw"
          style={{ '--len': '432', '--d': '0.9s' } as React.CSSProperties}
          aria-hidden="true"
        />

        {/* Heading Text */}
        <g className="f1-fade" style={{ '--d': '2.0s' } as React.CSSProperties} aria-hidden="true">
          <text
            x={250}
            y={164}
            textAnchor="middle"
            fill="var(--foreground)"
            fontSize="11.5"
            fontFamily="var(--font-sans, sans-serif)"
            fontWeight="700"
          >
            AI-Powered
          </text>
          <text
            x={250}
            y={180}
            textAnchor="middle"
            fill="var(--foreground)"
            fontSize="9.5"
            fontFamily="var(--font-sans, sans-serif)"
            fontWeight="600"
          >
            Performance Analysis
          </text>
        </g>

        {/* Data Readouts */}
        <g
          className="f1-data-readout f1-fade"
          style={{ '--d': '2.2s' } as React.CSSProperties}
          aria-hidden="true"
        >
          <text
            x={194}
            y={139}
            fill="var(--text-muted)"
            fontSize="5.5"
            fontFamily="var(--font-mono, monospace)"
            className="f1-flicker"
            style={{ '--fl-d': '3.5s' } as React.CSSProperties}
          >
            HEAP 0.00
          </text>
          <text
            x={270}
            y={139}
            fill="var(--text-muted)"
            fontSize="5.5"
            fontFamily="var(--font-mono, monospace)"
            className="f1-flicker"
            style={{ '--fl-d': '4.2s' } as React.CSSProperties}
          >
            TRACE 52.0
          </text>
          <text
            x={194}
            y={208}
            fill="var(--text-muted)"
            fontSize="5.5"
            fontFamily="var(--font-mono, monospace)"
            className="f1-flicker"
            style={{ '--fl-d': '3.8s' } as React.CSSProperties}
          >
            CPU 100
          </text>
          <text
            x={276}
            y={208}
            fill="var(--text-muted)"
            fontSize="5.5"
            fontFamily="var(--font-mono, monospace)"
            className="f1-flicker"
            style={{ '--fl-d': '4.5s' } as React.CSSProperties}
          >
            LAP 00.00
          </text>
        </g>

        {/* Display divider lines */}
        <g className="f1-fade" style={{ '--d': '1.0s' } as React.CSSProperties} aria-hidden="true">
          <line
            x1={192}
            y1={145}
            x2={308}
            y2={145}
            stroke="var(--primary)"
            strokeWidth="0.3"
            opacity="0.3"
          />
          <line
            x1={192}
            y1={195}
            x2={308}
            y2={195}
            stroke="var(--primary)"
            strokeWidth="0.3"
            opacity="0.3"
          />
        </g>

        {/* Horizontal divider across face plate */}
        <line
          x1={160}
          y1={224}
          x2={340}
          y2={224}
          stroke="var(--primary)"
          strokeWidth="0.5"
          opacity="0.4"
          className="f1-draw"
          style={{ '--len': '180', '--d': '1.2s' } as React.CSSProperties}
          aria-hidden="true"
        />

        {/* Button Clusters */}
        <g aria-hidden="true">
          {/* Top-left buttons */}
          <circle
            cx={168}
            cy={100}
            r={5}
            stroke="var(--primary)"
            strokeWidth="1"
            className="f1-draw"
            style={{ '--len': '32', '--d': '1.0s' } as React.CSSProperties}
          />
          <circle
            cx={184}
            cy={108}
            r={3.5}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-draw"
            style={{ '--len': '22', '--d': '1.05s' } as React.CSSProperties}
          />
          <circle
            cx={196}
            cy={100}
            r={3.5}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-draw"
            style={{ '--len': '22', '--d': '1.1s' } as React.CSSProperties}
          />

          {/* Top-right buttons */}
          <circle
            cx={332}
            cy={100}
            r={5}
            stroke="var(--primary)"
            strokeWidth="1"
            className="f1-draw"
            style={{ '--len': '32', '--d': '1.0s' } as React.CSSProperties}
          />
          <circle
            cx={316}
            cy={108}
            r={3.5}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-draw"
            style={{ '--len': '22', '--d': '1.05s' } as React.CSSProperties}
          />
          <circle
            cx={304}
            cy={100}
            r={3.5}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-draw"
            style={{ '--len': '22', '--d': '1.1s' } as React.CSSProperties}
          />

          {/* Left toggle column */}
          <rect
            x={160}
            y={135}
            width={14}
            height={9}
            rx={2}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-draw"
            style={{ '--len': '46', '--d': '1.15s' } as React.CSSProperties}
          />
          <rect
            x={160}
            y={155}
            width={14}
            height={9}
            rx={2}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-draw"
            style={{ '--len': '46', '--d': '1.2s' } as React.CSSProperties}
          />
          <rect
            x={160}
            y={175}
            width={14}
            height={9}
            rx={2}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-draw"
            style={{ '--len': '46', '--d': '1.25s' } as React.CSSProperties}
          />
          <rect
            x={160}
            y={195}
            width={14}
            height={9}
            rx={2}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-draw"
            style={{ '--len': '46', '--d': '1.3s' } as React.CSSProperties}
          />

          {/* Right toggle column */}
          <rect
            x={326}
            y={135}
            width={14}
            height={9}
            rx={2}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-draw"
            style={{ '--len': '46', '--d': '1.15s' } as React.CSSProperties}
          />
          <rect
            x={326}
            y={155}
            width={14}
            height={9}
            rx={2}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-draw"
            style={{ '--len': '46', '--d': '1.2s' } as React.CSSProperties}
          />
          <rect
            x={326}
            y={175}
            width={14}
            height={9}
            rx={2}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-draw"
            style={{ '--len': '46', '--d': '1.25s' } as React.CSSProperties}
          />
          <rect
            x={326}
            y={195}
            width={14}
            height={9}
            rx={2}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-draw"
            style={{ '--len': '46', '--d': '1.3s' } as React.CSSProperties}
          />

          {/* Mid-row buttons (below display) */}
          <circle
            cx={210}
            cy={234}
            r={4}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-draw"
            style={{ '--len': '25', '--d': '1.3s' } as React.CSSProperties}
          />
          <circle
            cx={230}
            cy={232}
            r={3}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-draw"
            style={{ '--len': '19', '--d': '1.32s' } as React.CSSProperties}
          />
          <circle
            cx={250}
            cy={230}
            r={3.5}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-draw"
            style={{ '--len': '22', '--d': '1.34s' } as React.CSSProperties}
          />
          <circle
            cx={270}
            cy={232}
            r={3}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-draw"
            style={{ '--len': '19', '--d': '1.32s' } as React.CSSProperties}
          />
          <circle
            cx={290}
            cy={234}
            r={4}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-draw"
            style={{ '--len': '25', '--d': '1.3s' } as React.CSSProperties}
          />

          {/* Thumb rotaries near grip junctions */}
          <circle
            cx={160}
            cy={118}
            r={6}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-draw"
            style={{ '--len': '38', '--d': '1.35s' } as React.CSSProperties}
          />
          <line
            x1={160}
            y1={113}
            x2={160}
            y2={116}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-fade"
            style={{ '--d': '1.5s' } as React.CSSProperties}
          />
          <circle
            cx={340}
            cy={118}
            r={6}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-draw"
            style={{ '--len': '38', '--d': '1.35s' } as React.CSSProperties}
          />
          <line
            x1={340}
            y1={113}
            x2={340}
            y2={116}
            stroke="var(--primary)"
            strokeWidth="0.8"
            className="f1-fade"
            style={{ '--d': '1.5s' } as React.CSSProperties}
          />
        </g>

        {/* Mounting screws */}
        <g className="f1-fade" style={{ '--d': '1.5s' } as React.CSSProperties} aria-hidden="true">
          <circle cx={162} cy={92} r={2} stroke="var(--primary)" strokeWidth="0.5" />
          <circle cx={338} cy={92} r={2} stroke="var(--primary)" strokeWidth="0.5" />
          <circle cx={162} cy={286} r={2} stroke="var(--primary)" strokeWidth="0.5" />
          <circle cx={338} cy={286} r={2} stroke="var(--primary)" strokeWidth="0.5" />
        </g>

        {/* Rotary Dials */}
        <g aria-hidden="true">
          {/* Left dial */}
          <circle
            cx={200}
            cy={262}
            r={22}
            stroke="var(--primary)"
            strokeWidth="1.2"
            className="f1-draw"
            style={{ '--len': '140', '--d': '1.4s' } as React.CSSProperties}
          />
          <circle
            cx={200}
            cy={262}
            r={14}
            stroke="var(--primary)"
            strokeWidth="0.5"
            className="f1-fade"
            style={{ '--d': '1.8s' } as React.CSSProperties}
            strokeDasharray="3 3"
          />
          <g className="f1-dial-tick" style={{ transformOrigin: '200px 262px' }}>
            <line
              x1={200}
              y1={242}
              x2={200}
              y2={248}
              stroke="var(--primary)"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </g>
          <g className="f1-fade" style={{ '--d': '1.6s' } as React.CSSProperties}>
            <line x1={200} y1={282} x2={200} y2={278} stroke="var(--primary)" strokeWidth="0.6" />
            <line x1={180} y1={262} x2={184} y2={262} stroke="var(--primary)" strokeWidth="0.6" />
            <line x1={220} y1={262} x2={216} y2={262} stroke="var(--primary)" strokeWidth="0.6" />
            <line x1={185} y1={247} x2={188} y2={250} stroke="var(--primary)" strokeWidth="0.5" />
            <line x1={215} y1={247} x2={212} y2={250} stroke="var(--primary)" strokeWidth="0.5" />
            <line x1={185} y1={277} x2={188} y2={274} stroke="var(--primary)" strokeWidth="0.5" />
            <line x1={215} y1={277} x2={212} y2={274} stroke="var(--primary)" strokeWidth="0.5" />
          </g>

          {/* Center dial */}
          <circle
            cx={250}
            cy={268}
            r={14}
            stroke="var(--primary)"
            strokeWidth="1"
            className="f1-draw"
            style={{ '--len': '88', '--d': '1.5s' } as React.CSSProperties}
          />
          <circle
            cx={250}
            cy={268}
            r={8}
            stroke="var(--primary)"
            strokeWidth="0.4"
            className="f1-fade"
            style={{ '--d': '1.9s' } as React.CSSProperties}
            strokeDasharray="2 2"
          />
          <g className="f1-fade" style={{ '--d': '1.7s' } as React.CSSProperties}>
            <line x1={250} y1={256} x2={250} y2={260} stroke="var(--primary)" strokeWidth="0.8" />
            <line x1={250} y1={280} x2={250} y2={276} stroke="var(--primary)" strokeWidth="0.5" />
            <line x1={238} y1={268} x2={242} y2={268} stroke="var(--primary)" strokeWidth="0.5" />
            <line x1={262} y1={268} x2={258} y2={268} stroke="var(--primary)" strokeWidth="0.5" />
          </g>

          {/* Right dial */}
          <circle
            cx={300}
            cy={262}
            r={22}
            stroke="var(--primary)"
            strokeWidth="1.2"
            className="f1-draw"
            style={{ '--len': '140', '--d': '1.4s' } as React.CSSProperties}
          />
          <circle
            cx={300}
            cy={262}
            r={14}
            stroke="var(--primary)"
            strokeWidth="0.5"
            className="f1-fade"
            style={{ '--d': '1.8s' } as React.CSSProperties}
            strokeDasharray="3 3"
          />
          <g className="f1-dial-tick f1-dial-tick-alt" style={{ transformOrigin: '300px 262px' }}>
            <line
              x1={300}
              y1={242}
              x2={300}
              y2={248}
              stroke="var(--primary)"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </g>
          <g className="f1-fade" style={{ '--d': '1.6s' } as React.CSSProperties}>
            <line x1={300} y1={282} x2={300} y2={278} stroke="var(--primary)" strokeWidth="0.6" />
            <line x1={280} y1={262} x2={284} y2={262} stroke="var(--primary)" strokeWidth="0.6" />
            <line x1={320} y1={262} x2={316} y2={262} stroke="var(--primary)" strokeWidth="0.6" />
            <line x1={285} y1={247} x2={288} y2={250} stroke="var(--primary)" strokeWidth="0.5" />
            <line x1={315} y1={247} x2={312} y2={250} stroke="var(--primary)" strokeWidth="0.5" />
            <line x1={285} y1={277} x2={288} y2={274} stroke="var(--primary)" strokeWidth="0.5" />
            <line x1={315} y1={277} x2={312} y2={274} stroke="var(--primary)" strokeWidth="0.5" />
          </g>
        </g>

        {/* Blueprint Annotations */}
        <g
          className="f1-fade f1-annotations"
          style={{ '--d': '1.8s' } as React.CSSProperties}
          aria-hidden="true"
        >
          {/* Width dimension line */}
          <line
            x1={55}
            y1={20}
            x2={445}
            y2={20}
            stroke="var(--primary)"
            strokeWidth="0.4"
            opacity="0.4"
          />
          <line
            x1={55}
            y1={15}
            x2={55}
            y2={25}
            stroke="var(--primary)"
            strokeWidth="0.4"
            opacity="0.4"
          />
          <line
            x1={445}
            y1={15}
            x2={445}
            y2={25}
            stroke="var(--primary)"
            strokeWidth="0.4"
            opacity="0.4"
          />
          <text
            x={250}
            y={17}
            textAnchor="middle"
            fill="var(--primary)"
            fontSize="5.5"
            fontFamily="var(--font-mono, monospace)"
            opacity="0.4"
          >
            310.0mm
          </text>

          {/* Height dimension line */}
          <line
            x1={465}
            y1={82}
            x2={465}
            y2={296}
            stroke="var(--primary)"
            strokeWidth="0.4"
            opacity="0.4"
          />
          <line
            x1={460}
            y1={82}
            x2={470}
            y2={82}
            stroke="var(--primary)"
            strokeWidth="0.4"
            opacity="0.4"
          />
          <line
            x1={460}
            y1={296}
            x2={470}
            y2={296}
            stroke="var(--primary)"
            strokeWidth="0.4"
            opacity="0.4"
          />
          <text
            x={470}
            y={192}
            fill="var(--primary)"
            fontSize="5.5"
            fontFamily="var(--font-mono, monospace)"
            opacity="0.4"
            transform="rotate(90 470 192)"
          >
            201.0mm
          </text>

          {/* Grip junction markers */}
          <circle
            cx={152}
            cy={142}
            r={3}
            stroke="var(--primary)"
            strokeWidth="0.4"
            opacity="0.35"
          />
          <circle
            cx={348}
            cy={142}
            r={3}
            stroke="var(--primary)"
            strokeWidth="0.4"
            opacity="0.35"
          />
          <circle
            cx={152}
            cy={252}
            r={3}
            stroke="var(--primary)"
            strokeWidth="0.4"
            opacity="0.35"
          />
          <circle
            cx={348}
            cy={252}
            r={3}
            stroke="var(--primary)"
            strokeWidth="0.4"
            opacity="0.35"
          />

          {/* Display callout */}
          <line
            x1={316}
            y1={130}
            x2={390}
            y2={105}
            stroke="var(--primary)"
            strokeWidth="0.35"
            opacity="0.35"
          />
          <circle cx={316} cy={130} r={1.5} fill="var(--primary)" opacity="0.35" />
          <text
            x={393}
            y={107}
            fill="var(--primary)"
            fontSize="5"
            fontFamily="var(--font-mono, monospace)"
            opacity="0.35"
          >
            DISPLAY UNIT
          </text>

          {/* Grip callout */}
          <line
            x1={84}
            y1={158}
            x2={48}
            y2={128}
            stroke="var(--primary)"
            strokeWidth="0.3"
            opacity="0.3"
          />
          <circle cx={84} cy={158} r={1.5} fill="var(--primary)" opacity="0.3" />
          <text
            x={15}
            y={125}
            fill="var(--primary)"
            fontSize="5"
            fontFamily="var(--font-mono, monospace)"
            opacity="0.3"
          >
            GRIP-L
          </text>

          {/* Paddle callout */}
          <line
            x1={445}
            y1={65}
            x2={468}
            y2={50}
            stroke="var(--primary)"
            strokeWidth="0.3"
            opacity="0.3"
          />
          <circle cx={445} cy={65} r={1.5} fill="var(--primary)" opacity="0.3" />
          <text
            x={470}
            y={52}
            fill="var(--primary)"
            fontSize="5"
            fontFamily="var(--font-mono, monospace)"
            opacity="0.3"
          >
            PADDLE-R
          </text>

          {/* Section label */}
          <text
            x={20}
            y={340}
            fill="var(--primary)"
            fontSize="5"
            fontFamily="var(--font-mono, monospace)"
            opacity="0.25"
          >
            STEERING WHEEL ASSY — FRONT VIEW
          </text>

          {/* Revision label */}
          <text
            x={485}
            y={340}
            textAnchor="end"
            fill="var(--primary)"
            fontSize="5"
            fontFamily="var(--font-mono, monospace)"
            opacity="0.25"
          >
            REV. C
          </text>
        </g>
      </svg>
    </div>
  );
}

const cssStyles = `
  .f1-draw {
    stroke-dasharray: var(--len, 1000);
    stroke-dashoffset: var(--len, 1000);
    animation: f1-draw-in 1.5s ease-in-out forwards;
    animation-delay: var(--d, 0s);
  }
  @keyframes f1-draw-in {
    to { stroke-dashoffset: 0; }
  }

  .f1-fade {
    opacity: 0;
    animation: f1-fade-in 0.8s ease-in-out forwards;
    animation-delay: var(--d, 0s);
  }
  @keyframes f1-fade-in {
    to { opacity: 1; }
  }

  .f1-grid {
    opacity: 0;
    animation: f1-grid-in 2s ease-in-out forwards;
  }
  @keyframes f1-grid-in {
    to { opacity: 0.08; }
  }

  .f1-led {
    opacity: 0.15;
    will-change: opacity;
    animation: f1-led-sweep 2s ease-in-out infinite;
    animation-delay: var(--led-d, 3s);
  }
  @keyframes f1-led-sweep {
    0%, 100% { opacity: 0.15; }
    50% { opacity: 0.6; }
  }

  .f1-flicker {
    will-change: opacity;
    animation: f1-data-flicker 4s ease-in-out infinite;
    animation-delay: var(--fl-d, 3.5s);
  }
  @keyframes f1-data-flicker {
    0%, 90%, 100% { opacity: 1; }
    94%, 96% { opacity: 0.15; }
  }

  .f1-dial-tick {
    will-change: transform;
    animation: f1-dial-rotate 6s ease-in-out infinite;
    animation-delay: 3.5s;
  }
  .f1-dial-tick-alt {
    animation-delay: 4.5s;
  }
  @keyframes f1-dial-rotate {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(15deg); }
  }

  @media (max-width: 639px) {
    .f1-data-readout { display: none; }
    .f1-annotations { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .f1-draw {
      animation: none !important;
      stroke-dasharray: none !important;
      stroke-dashoffset: 0 !important;
    }
    .f1-fade {
      animation: none !important;
      opacity: 1 !important;
    }
    .f1-grid {
      animation: none !important;
      opacity: 0.08 !important;
    }
    .f1-led {
      animation: none !important;
      opacity: 0.3 !important;
    }
    .f1-flicker {
      animation: none !important;
      opacity: 1 !important;
    }
    .f1-dial-tick,
    .f1-dial-tick-alt {
      animation: none !important;
      transform: none !important;
    }
  }
`;
