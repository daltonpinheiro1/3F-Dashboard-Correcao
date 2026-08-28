import type { RefObject } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Sun, Upload } from 'lucide-react';
import type { ImageQualityReport } from '../../lib/atestadosImageQuality';

const DICAS = [
  'Apoie o documento em superfície plana',
  'Enquadre o papel inteiro na moldura',
  'Evite sombras e reflexos',
  'Mantenha o celular paralelo ao documento',
];

export function CapturaGuiada({
  previewUrl,
  quality,
  onPick,
  fileInputRef,
  onFileChange,
}: {
  previewUrl: string | null;
  quality: ImageQualityReport | null;
  onPick: () => void;
  fileInputRef: RefObject<HTMLInputElement>;
  onFileChange: (file: File) => void;
}) {
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
        {previewUrl ? (
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
              JPG, PNG ou PDF · máx. 8 MB · IA analisa ao importar
            </p>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileChange(f);
        }}
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

      <button type="button" className="btn-secondary text-xs w-full flex items-center justify-center gap-2" onClick={onPick}>
        <Upload size={14} />
        {previewUrl ? 'Trocar arquivo' : 'Selecionar arquivo'}
      </button>
    </div>
  );
}
