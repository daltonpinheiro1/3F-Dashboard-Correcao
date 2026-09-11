import { useRef, type RefObject } from 'react';
import { AlertTriangle, Camera, CheckCircle2, ImagePlus, Sun, Upload } from 'lucide-react';
import type { ImageQualityReport } from '../../lib/atestadosImageQuality';

const DICAS = [
  'Apoie o documento em superfície plana',
  'Enquadre o papel inteiro na moldura',
  'Evite sombras e reflexos',
  'Mantenha o celular paralelo ao documento',
];

const ACCEPT_GALERIA =
  'image/*,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.avif,.pdf,application/pdf';

export function CapturaGuiada({
  previewUrl,
  previewIsPdf = false,
  quality,
  onPick,
  fileInputRef,
  onFileChange,
}: {
  previewUrl: string | null;
  previewIsPdf?: boolean;
  quality: ImageQualityReport | null;
  onPick: () => void;
  fileInputRef: RefObject<HTMLInputElement>;
  onFileChange: (file: File) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);

  const pickFile = (el: HTMLInputElement | null, file: File | undefined) => {
    if (file) onFileChange(file);
    if (el) el.value = '';
  };

  return (
    <div className="space-y-3">
      <div
        className={`relative border-2 border-dashed rounded-xl p-4 text-center transition-colors cursor-pointer overflow-hidden ${
          quality && !quality.ok
            ? 'border-amber-400 bg-amber-50/40'
            : previewUrl
              ? 'border-emerald-300 bg-white'
              : 'border-gray-200 hover:border-blue-300'
        }`}
        onClick={onPick}
        onKeyDown={(e) => e.key === 'Enter' && onPick()}
        role="button"
        tabIndex={0}
      >
        {!previewUrl && (
          <div
            className="pointer-events-none absolute inset-4 border-2 border-blue-400/40 rounded-lg"
            aria-hidden
          />
        )}
        {previewUrl && previewIsPdf ? (
          <object
            data={previewUrl}
            type="application/pdf"
            aria-label="Prévia do atestado em PDF"
            className="relative z-10 h-56 w-full rounded-lg bg-white"
          >
            <p className="text-xs text-gray-600">
              PDF selecionado. A prévia não está disponível neste navegador.
            </p>
          </object>
        ) : previewUrl ? (
          <img
            src={previewUrl}
            alt="Prévia do atestado"
            className="max-h-56 w-full mx-auto rounded-lg object-contain bg-white relative z-10"
          />
        ) : (
          <>
            <Camera className="mx-auto text-blue-500 mb-2 relative z-10" size={28} />
            <p className="text-sm text-gray-700 font-medium relative z-10">Capturar ou enviar atestado</p>
            <p className="text-xs text-gray-500 mt-1 relative z-10">
              Foto da câmera, JPG, PNG, WEBP, HEIC ou PDF · máx. 8 MB
            </p>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_GALERIA}
        className="hidden"
        onChange={(e) => pickFile(e.currentTarget, e.target.files?.[0])}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => pickFile(e.currentTarget, e.target.files?.[0])}
      />

      {!previewUrl && (
        <ul className="text-[11px] text-gray-600 space-y-1 bg-gray-50 rounded-lg p-3 border border-gray-100">
          {DICAS.map((d) => (
            <li key={d} className="flex items-start gap-2">
              <Sun size={12} className="shrink-0 mt-0.5 text-amber-500" />
              {d}
            </li>
          ))}
        </ul>
      )}

      {quality && previewUrl && (
        <div
          className={`rounded-lg px-3 py-2 text-xs flex items-start gap-2 ${
            quality.ok
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border border-amber-200 text-amber-900'
          }`}
        >
          {quality.ok ? <CheckCircle2 size={14} className="shrink-0" /> : <AlertTriangle size={14} className="shrink-0" />}
          <div>
            <p className="font-semibold">Qualidade da foto: {quality.score}%</p>
            {quality.issues.length > 0 ? (
              <ul className="mt-1 list-disc pl-4">
                {quality.issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            ) : (
              <p>Boa para leitura automática.</p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn-secondary text-xs w-full flex items-center justify-center gap-2"
          onClick={() => cameraRef.current?.click()}
        >
          <Camera size={14} />
          Tirar foto
        </button>
        <button type="button" className="btn-secondary text-xs w-full flex items-center justify-center gap-2" onClick={onPick}>
          {previewUrl ? <Upload size={14} /> : <ImagePlus size={14} />}
          {previewUrl ? 'Trocar arquivo' : 'Galeria / PDF'}
        </button>
      </div>
    </div>
  );
}
