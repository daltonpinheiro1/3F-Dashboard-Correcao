import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, Loader2, Sparkles, Upload } from 'lucide-react';
import { Field } from '../advertencias/Field';
import { fetchEvaLive } from '../../lib/evaDash';
import {
  buildOperadoresCatalog,
  filtrarOperadores,
  type OperadorSugestao,
} from '../../lib/operadoresCatalog';
import { listAdvertenciasPage } from '../../lib/advertenciasService';
import {
  TIPO_LABELS,
  type Atestado,
  type AtestadoTipo,
  type AtestadoUnidade,
  type IaAnalise,
  scoreRequisitos,
} from '../../lib/atestadosEscala';
import {
  analisarAtestadoImagem,
  contarAtestadosColaborador,
  createAtestado,
  listAtestadosPage,
} from '../../lib/atestadosService';
import { findSobreposicoes, requerAlertaInss } from '../../lib/atestadosDuplicidade';
import { analisarAtestadoOcrLocal } from '../../lib/atestadosOcrLocal';
import { prepareAtestadoUpload } from '../../lib/atestadosImagePrep';
import {
  previewStoragePath,
  validateAtestadoFile,
} from '../../lib/atestadosStorage';

export function ProtocolarPanel({
  rows,
  userName,
  userEmail,
  mode = 'dp',
  onCreated,
  onError,
}: {
  rows: Atestado[];
  userName: string;
  userEmail: string;
  mode?: 'dp' | 'solicitacao';
  onCreated: (a: Atestado) => void;
  onError: (m: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const arquivoFileRef = useRef<File | null>(null);
  const [nome, setNome] = useState('');
  const [matricula, setMatricula] = useState('');
  const [cpf, setCpf] = useState('');
  const [cargo, setCargo] = useState('');
  const [tipo, setTipo] = useState<AtestadoTipo>('medico');
  const [unidade, setUnidade] = useState<AtestadoUnidade>('dias');
  const [qtdDias, setQtdDias] = useState('');
  const [qtdHoras, setQtdHoras] = useState('');
  const [dataInicio, setDataInicio] = useState(() => new Date().toISOString().slice(0, 10));
  const [dataFim, setDataFim] = useState('');
  const [cid, setCid] = useState('');
  const [medico, setMedico] = useState('');
  const [crm, setCrm] = useState('');
  const [obs, setObs] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imagemBase64, setImagemBase64] = useState('');
  const [imagemThumbBase64, setImagemThumbBase64] = useState<string | null>(null);
  const [prepStats, setPrepStats] = useState<string | null>(null);
  const [prepLoading, setPrepLoading] = useState(false);
  const [arquivoNome, setArquivoNome] = useState('');
  const [iaLoading, setIaLoading] = useState(false);
  const [iaAnalise, setIaAnalise] = useState<IaAnalise | null>(null);
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState<OperadorSugestao[]>([]);
  const [sugestoes, setSugestoes] = useState<OperadorSugestao[]>([]);
  const [showSug, setShowSug] = useState(false);
  const [dupAlerta, setDupAlerta] = useState<string | null>(null);
  const [dupRows, setDupRows] = useState<Atestado[]>([]);

  const rowsDup = useMemo(() => {
    if (mode !== 'solicitacao') return rows;
    const map = new Map<string, Atestado>();
    for (const r of [...rows, ...dupRows]) map.set(r.id, r);
    return [...map.values()];
  }, [mode, rows, dupRows]);

  const draftNovo = useMemo(
    () => ({
      colaborador_nome: nome,
      colaborador_matricula: matricula,
      data_inicio: dataInicio,
      data_fim: dataFim || null,
      quantidade_dias: unidade === 'dias' ? Number(qtdDias) || 0 : 0,
      quantidade_horas: unidade === 'horas' ? Number(qtdHoras) || 0 : 0,
      unidade_periodo: unidade,
      status: 'protocolado' as const,
    }),
    [nome, matricula, dataInicio, dataFim, qtdDias, qtdHoras, unidade],
  );

  const sobreposLocal = useMemo(() => {
    if (!nome.trim()) return [];
    return findSobreposicoes(rowsDup, {
      ...draftNovo,
      id: '__draft__',
      protocolo: '',
      tipo,
      created_at: '',
      updated_at: '',
    } as Atestado);
  }, [rowsDup, draftNovo, nome, tipo]);

  useEffect(() => {
    if (mode !== 'solicitacao') {
      setDupRows([]);
      return;
    }
    const q = matricula.trim() || nome.trim();
    if (q.length < 2) {
      setDupRows([]);
      return;
    }
    let cancelled = false;
    void listAtestadosPage({ colaborador: q, limit: 100 })
      .then((page) => {
        if (!cancelled) setDupRows(page.rows);
      })
      .catch(() => {
        if (!cancelled) setDupRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, nome, matricula]);

  const alertaInss = useMemo(() => requerAlertaInss(draftNovo), [draftNovo]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [eva, adv] = await Promise.all([
          fetchEvaLive().catch(() => null),
          listAdvertenciasPage({ limit: 200 }).catch(() => ({ rows: [] })),
        ]);
        if (!cancelled) setCatalog(buildOperadoresCatalog(eva, adv.rows));
      } catch {
        /* catálogo opcional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const contagemColab = useMemo(
    () => contarAtestadosColaborador(rowsDup, matricula, nome),
    [rowsDup, matricula, nome],
  );

  const pathPreview = useMemo(
    () =>
      previewStoragePath({
        dataReferencia: dataInicio,
        colaboradorNome: nome || 'colaborador',
        ext: arquivoNome.toLowerCase().endsWith('.pdf') ? 'pdf' : 'jpg',
      }),
    [dataInicio, nome, arquivoNome],
  );

  const scoreIa = scoreRequisitos(iaAnalise?.requisitos);

  const onBuscaNome = (v: string) => {
    setNome(v);
    const sug = filtrarOperadores(catalog, v, 8);
    setSugestoes(sug);
    setShowSug(sug.length > 0 && v.trim().length >= 2);
  };

  const selecionarOp = (op: OperadorSugestao) => {
    setNome(op.nome);
    setMatricula(op.matricula || op.login || '');
    setCpf(op.cpf || '');
    setCargo(op.cargo || 'Operador');
    setShowSug(false);
  };

  const onFile = async (file: File) => {
    const valid = validateAtestadoFile(file);
    if (!valid.ok) {
      onError(valid.error);
      return;
    }
    if (previewUrl && previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setArquivoNome(file.name);
    arquivoFileRef.current = file;
    setIaAnalise(null);
    setPrepStats(null);
    setPrepLoading(true);
    try {
      const prep = await prepareAtestadoUpload(file);
      setPreviewUrl(prep.previewUrl);
      setImagemBase64(prep.fullBase64);
      setImagemThumbBase64(prep.thumbBase64);
      if (prep.isPdf) {
        setPrepStats(`PDF ${(prep.stats.originalBytes / 1024).toFixed(0)} KB → rede SMB`);
      } else {
        const saved = Math.max(
          0,
          100 - Math.round((prep.stats.fullBytes / prep.stats.originalBytes) * 100),
        );
        setPrepStats(
          `Otimizado: ${(prep.stats.originalBytes / 1024).toFixed(0)} KB → ${(prep.stats.fullBytes / 1024).toFixed(0)} KB (arquivo) + ${((prep.stats.thumbBytes || 0) / 1024).toFixed(0)} KB (nuvem) · ~${saved}% menor`,
        );
      }
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Falha ao otimizar imagem.');
    } finally {
      setPrepLoading(false);
    }
  };

  const aplicarAnalise = (analise: IaAnalise) => {
    setIaAnalise(analise);
    if (analise.tipo && analise.tipo in TIPO_LABELS) setTipo(analise.tipo as AtestadoTipo);
    if (analise.unidade_periodo) setUnidade(analise.unidade_periodo);
    if (analise.quantidade_dias) setQtdDias(String(analise.quantidade_dias));
    if (analise.quantidade_horas) setQtdHoras(String(analise.quantidade_horas));
    if (analise.data_inicio) setDataInicio(analise.data_inicio);
    if (analise.data_fim) setDataFim(analise.data_fim);
    if (analise.cid) setCid(analise.cid);
    if (analise.medico_nome) setMedico(analise.medico_nome);
    if (analise.crm_uf) setCrm(analise.crm_uf);
  };

  const rodarIa = async () => {
    if (!imagemBase64) {
      onError('Envie a foto do atestado antes da análise.');
      return;
    }
    setIaLoading(true);
    setDupAlerta(null);
    try {
      const analise = await analisarAtestadoImagem({
        imagem_base64: imagemBase64,
        colaborador_nome: nome,
      });
      aplicarAnalise(analise);
    } catch {
      if (arquivoFileRef.current) {
        try {
          const ocr = await analisarAtestadoOcrLocal(arquivoFileRef.current);
          aplicarAnalise(ocr);
          onError('IA indisponível — campos preenchidos via OCR local. Revise antes de protocolar.');
          return;
        } catch (ocrErr: unknown) {
          onError(
            ocrErr instanceof Error ? ocrErr.message : 'Falha na IA e no OCR local.',
          );
          return;
        }
      }
      onError('Falha na análise IA. Tente novamente ou preencha manualmente.');
    } finally {
      setIaLoading(false);
    }
  };

  const protocolar = async (ignorarDuplicidade = false) => {
    if (saving) return;
    if (!nome.trim()) {
      onError('Selecione o colaborador.');
      return;
    }
    if (!imagemBase64) {
      onError('Anexe a foto do atestado.');
      return;
    }
    if (sobreposLocal.length && !ignorarDuplicidade) {
      setDupAlerta(
        `Período sobreposto com ${sobreposLocal.map((d) => d.protocolo).join(', ')}. Confirme para continuar.`,
      );
      return;
    }
    setSaving(true);
    try {
      const created = await createAtestado({
        colaborador_nome: nome.trim(),
        colaborador_matricula: matricula || null,
        colaborador_cpf: cpf || null,
        colaborador_cargo: cargo || null,
        tipo,
        unidade_periodo: unidade,
        quantidade_dias: unidade === 'dias' ? Number(qtdDias) || 0 : 0,
        quantidade_horas: unidade === 'horas' ? Number(qtdHoras) || 0 : 0,
        data_inicio: dataInicio || null,
        data_fim: dataFim || null,
        cid: cid || null,
        medico_nome: medico || null,
        crm_uf: crm || null,
        status: 'protocolado',
        origem: mode === 'solicitacao' ? 'supervisor' : 'dp',
        observacoes: obs || null,
        arquivo_nome_original: arquivoNome || null,
        ia_analise: iaAnalise || {},
        ia_confianca: iaAnalise?.confianca ?? null,
        criado_por_email: userEmail,
        criado_por_nome: userName,
        imagem_base64: imagemBase64,
        imagem_thumb_base64: imagemThumbBase64,
        ignorar_duplicidade: ignorarDuplicidade,
      });
      onCreated(created);
      setNome('');
      setMatricula('');
      setCpf('');
      setCargo('');
      setQtdDias('');
      setQtdHoras('');
      setDataFim('');
      setCid('');
      setMedico('');
      setCrm('');
      setObs('');
      setImagemBase64('');
      setImagemThumbBase64(null);
      setPrepStats(null);
      setArquivoNome('');
      setIaAnalise(null);
      setDupAlerta(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Camera size={16} /> Foto do atestado
          </h3>
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-blue-300 transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Prévia do atestado"
                className="max-h-48 mx-auto rounded-lg object-contain"
              />
            ) : (
              <>
                <Upload className="mx-auto text-gray-400 mb-2" size={28} />
                <p className="text-sm text-gray-600">Clique para enviar JPG, PNG ou PDF</p>
                <p className="text-xs text-gray-400 mt-1">Máx. 8 MB</p>
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          <button
            type="button"
            className="btn-secondary text-xs w-full flex items-center justify-center gap-2"
            disabled={!imagemBase64 || iaLoading || prepLoading}
            onClick={() => void rodarIa()}
          >
            {iaLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Analisar com IA (período, CID, requisitos)
          </button>
          {iaAnalise && (
            <div className="rounded-lg bg-violet-50 border border-violet-100 p-3 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-medium text-violet-900">Checklist IA</span>
                <span className="text-violet-700">{scoreIa}% requisitos</span>
              </div>
              <p className="text-violet-800">{iaAnalise.resumo}</p>
              {iaAnalise.alertas?.length ? (
                <ul className="list-disc pl-4 text-amber-800">
                  {iaAnalise.alertas.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
          <p className="text-[10px] text-gray-400">
            Arquivo completo (SMB): <code className="text-gray-500">{pathPreview}</code>
          </p>
          {prepLoading && (
            <p className="text-xs text-blue-600 flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> Otimizando imagem (JPEG 1600px)…
            </p>
          )}
          {prepStats && !prepLoading && (
            <p className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded">{prepStats}</p>
          )}
        </div>

        <div className="card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">
            {mode === 'solicitacao' ? 'Solicitar atestado (envio ao DP)' : 'Dados do protocolo'}
          </h3>
          {sobreposLocal.length > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
              Possível sobreposição com: {sobreposLocal.map((d) => d.protocolo).join(', ')}
            </p>
          )}
          {alertaInss && (
            <p className="text-xs text-red-700 bg-red-50 px-2 py-1 rounded">
              Afastamento &gt; 15 dias — verifique encaminhamento INSS na aba Gerencial.
            </p>
          )}
          <div className="relative">
            <Field label="Colaborador *">
              <input
                className="input w-full"
                value={nome}
                onChange={(e) => onBuscaNome(e.target.value)}
                onFocus={() => nome.length >= 2 && setShowSug(sugestoes.length > 0)}
                placeholder="Nome, matrícula ou login"
                autoComplete="off"
              />
            </Field>
            {showSug && (
              <ul className="absolute z-20 w-full bg-white border rounded-lg shadow-lg mt-1 max-h-40 overflow-auto text-sm">
                {sugestoes.map((s) => (
                  <li key={`${s.nome}-${s.matricula}`}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-blue-50"
                      onClick={() => selecionarOp(s)}
                    >
                      {s.nome}
                      {s.matricula ? ` · ${s.matricula}` : ''}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {contagemColab > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
              Este colaborador já possui {contagemColab} atestado(s) no acervo carregado.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Matrícula">
              <input className="input w-full" value={matricula} onChange={(e) => setMatricula(e.target.value)} />
            </Field>
            <Field label="CPF">
              <input className="input w-full" value={cpf} onChange={(e) => setCpf(e.target.value)} />
            </Field>
          </div>
          <Field label="Tipo">
            <select className="input w-full" value={tipo} onChange={(e) => setTipo(e.target.value as AtestadoTipo)}>
              {(Object.keys(TIPO_LABELS) as AtestadoTipo[]).map((k) => (
                <option key={k} value={k}>
                  {TIPO_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Período">
            <div className="flex gap-2 mb-2">
              {(['dias', 'horas'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  className={`text-xs px-3 py-1 rounded-full border ${unidade === u ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600'}`}
                  onClick={() => setUnidade(u)}
                >
                  {u === 'dias' ? 'Dias' : 'Horas'}
                </button>
              ))}
            </div>
            {unidade === 'dias' ? (
              <input
                className="input w-full"
                type="number"
                min={0}
                step={0.5}
                value={qtdDias}
                onChange={(e) => setQtdDias(e.target.value)}
                placeholder="Quantidade de dias"
              />
            ) : (
              <input
                className="input w-full"
                type="number"
                min={0}
                step={0.5}
                value={qtdHoras}
                onChange={(e) => setQtdHoras(e.target.value)}
                placeholder="Quantidade de horas"
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início">
              <input
                type="date"
                className="input w-full"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </Field>
            <Field label="Fim">
              <input
                type="date"
                className="input w-full"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="CID">
              <input className="input w-full" value={cid} onChange={(e) => setCid(e.target.value)} placeholder="J06.9" />
            </Field>
            <Field label="Médico">
              <input className="input w-full" value={medico} onChange={(e) => setMedico(e.target.value)} />
            </Field>
            <Field label="CRM/UF">
              <input className="input w-full" value={crm} onChange={(e) => setCrm(e.target.value)} />
            </Field>
          </div>
          <Field label="Observações">
            <textarea className="input w-full min-h-[60px]" value={obs} onChange={(e) => setObs(e.target.value)} />
          </Field>
          <button
            type="button"
            className="btn-primary w-full text-sm flex items-center justify-center gap-2"
            disabled={saving || prepLoading}
            onClick={() => void protocolar(Boolean(dupAlerta))}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {dupAlerta ? 'Confirmar mesmo assim' : mode === 'solicitacao' ? 'Enviar solicitação' : 'Protocolar atestado'}
          </button>
          {dupAlerta && <p className="text-xs text-amber-800">{dupAlerta}</p>}
        </div>
      </div>
    </div>
  );
}
