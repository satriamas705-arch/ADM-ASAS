import React from 'react';

interface OfficialSignatureGraphicProps {
  signatureUrl?: string;
  stampUrl?: string;
  heightClass?: string;
  align?: 'center' | 'left';
}

/**
 * Renders an official wet-signature look in HTML previews:
 * signature centered/aligned with an enlarged school stamp overlapping on top (menimpa TTD).
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
        align === 'left' ? 'justify-start pl-4' : 'justify-center'
      } select-none overflow-visible my-0.5`}
    >
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
          className={`pointer-events-none object-contain opacity-90 mix-blend-multiply h-[160%] w-auto max-w-[104px] absolute top-1/2 -translate-y-1/2 z-20 ${
            align === 'left' ? 'left-0 -translate-x-1' : 'left-1/2 -translate-x-[74%]'
          }`}
        />
      )}
      {!hasGraphic && <span className="sr-only">Area Tanda Tangan</span>}
    </div>
  );
};
