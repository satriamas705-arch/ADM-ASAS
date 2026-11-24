import React from 'react';

interface OfficialSignatureGraphicProps {
  signatureUrl?: string;
  stampUrl?: string;
  heightClass?: string;
  align?: 'center' | 'left';
}

/**
 * Renders an official wet-signature look in HTML previews:
 * school stamp is positioned to the left of the signature so it does not cover the signature strokes.
 */
export const OfficialSignatureGraphic: React.FC<OfficialSignatureGraphicProps> = ({
  signatureUrl,
  stampUrl,
  heightClass = 'h-14',
  align = 'center',
}) => {
  const hasGraphic = Boolean(signatureUrl || stampUrl);

  return (
    <div
      className={`relative ${heightClass} flex items-center ${
        align === 'left' ? 'justify-start pl-10' : 'justify-center'
      } select-none overflow-visible my-0.5`}
    >
      <div className="relative inline-flex items-center justify-center h-full">
        {signatureUrl && (
          <img
            src={signatureUrl}
            alt="Tanda Tangan"
            className="pointer-events-none object-contain mix-blend-multiply h-[94%] w-auto max-w-[140px] relative z-10"
          />
        )}
        {stampUrl && (
          <img
            src={stampUrl}
            alt="Stempel Sekolah"
            className={`pointer-events-none object-contain opacity-80 mix-blend-multiply h-[155%] w-auto max-w-[100px] z-20 ${
              signatureUrl
                ? 'absolute top-1/2 -translate-y-1/2 right-[92%]'
                : 'relative'
            }`}
          />
        )}
      </div>
      {!hasGraphic && <span className="sr-only">Area Tanda Tangan</span>}
    </div>
  );
};
