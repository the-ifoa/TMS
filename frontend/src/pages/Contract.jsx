import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineDocumentText,
  HiOutlineMail,
  HiOutlineEye,
  HiOutlinePaperAirplane,
  HiOutlinePhotograph,
  HiOutlineTrash,
  HiOutlineX,
  HiOutlineOfficeBuilding,
  HiOutlineCalendar,
  HiOutlineArrowLeft,
  HiOutlinePencil,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineRefresh,
  HiOutlineSearch,
  HiOutlineLightBulb,
  HiOutlinePencilAlt,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import {
  getContractDefaults,
  getContractDefaultsForAirline,
  getContractAirlines,
  getContractPdf,
  previewContract,
  sendContract,
} from '../api';

const STRUCTURAL = { spacer: true, sigimage: true };

function valueToHtml(v) {
  let html = String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  html = html.replace(/\*\*([\s\S]*?)\*\*/g, '<b>$1</b>');
  html = html.replace(/\{\{([\s\S]*?)\}\}/g, '<mark class="hl-mark">$1</mark>');
  return html || '<br>';
}
function htmlToValue(html) {
  return html
    .replace(/<b>([\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<mark[^>]*>([\s\S]*?)<\/mark>/gi, '{{$1}}')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div><div>/gi, '\n').replace(/<div>/gi, '\n').replace(/<\/div>/gi, '')
    .replace(/<\/p><p>/gi, '\n').replace(/<p>/gi, '').replace(/<\/p>/gi, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '');
}

function RichEditor({ value, onChange, onFocus, className = '' }) {
  const ref       = useRef(null);
  const focused   = useRef(false);
  const onChangeR = useRef(onChange);
  onChangeR.current = onChange;

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = valueToHtml(value);
  }, []);

  const prevVal = useRef(value);
  useEffect(() => {
    if (!focused.current && prevVal.current !== value && ref.current) {
      ref.current.innerHTML = valueToHtml(value);
    }
    prevVal.current = value;
  }, [value]);

  const handleKeyDown = (e) => {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);

    // Walk up to find enclosing <mark class="hl-mark">
    const getMark = (node) => {
      let el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      while (el && el !== ref.current) {
        if (el.tagName === 'MARK') return el;
        el = el.parentElement;
      }
      return null;
    };

    const mark = getMark(range.commonAncestorContainer);
    if (!mark) return;

    const markText = mark.textContent;
    const willEmpty = range.collapsed
      ? markText.length <= 1
      : range.toString().length >= markText.length;

    if (willEmpty) {
      e.preventDefault();
      mark.textContent = '';
      // Keep cursor inside the empty mark
      try {
        const r = document.createRange();
        r.setStart(mark, 0);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      } catch {}
      ref.current?.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onFocus={() => { focused.current = true; onFocus?.(); }}
      onBlur={() => { focused.current = false; }}
      onKeyDown={handleKeyDown}
      onInput={() => {
        if (!ref.current) return;
        const v = htmlToValue(ref.current.innerHTML);
        prevVal.current = v;
        onChangeR.current(v);
      }}
      className={`input-field min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent-400 whitespace-pre-wrap break-words cursor-text ${className}`}
    />
  );
}

function BlockEditor({ block, onTextChange, onFocus }) {
  const { type, text = '' } = block;

  if (type === 'title' || type === 'heading') {
    return (
      <input type="text" value={text} onFocus={onFocus}
        onChange={e => onTextChange(e.target.value)}
        className={`input-field w-full ${type === 'title' ? 'font-bold text-center text-[15px]' : 'font-bold'}`}
      />
    );
  }

  if (type === 'party') {
    const pipeIdx = text.indexOf('|');
    const label   = pipeIdx >= 0 ? text.slice(0, pipeIdx) : 'BETWEEN';
    const content = pipeIdx >= 0 ? text.slice(pipeIdx + 1) : text;
    return (
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 mt-2 px-2 py-0.5 rounded bg-primary-100 text-xs font-bold text-primary-700 uppercase tracking-wide">
          {label}
        </span>
        <RichEditor value={content} onChange={v => onTextChange(label + '|' + v)}
          onFocus={onFocus} className="flex-1" />
      </div>
    );
  }

  if (type === 'sigrow') {
    const pipeIdx = text.indexOf('|');
    const left  = pipeIdx >= 0 ? text.slice(0, pipeIdx) : text;
    const right = pipeIdx >= 0 ? text.slice(pipeIdx + 1) : '';
    return (
      <div className="grid grid-cols-2 gap-4">
        <input type="text" value={left} onFocus={onFocus} spellCheck={false}
          onChange={e => onTextChange(e.target.value + '|' + right)}
          className="input-field w-full" />
        <RichEditor value={right} onChange={v => onTextChange(left + '|' + v)}
          onFocus={onFocus} />
      </div>
    );
  }

  return <RichEditor value={text} onChange={onTextChange} onFocus={onFocus} />;
}

const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'sent',     label: 'Sent' },
  { key: 'not_sent', label: 'Not Sent' },
];

// ── Airlines list view ────────────────────────────────────────────────────────
function AirlinesList({ airlines, onCreateContract, onViewContract, loading }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const visible = airlines.filter(a => {
    const matchFilter =
      filter === 'all'     ? true :
      filter === 'sent'    ? a.contractSent :
      !a.contractSent;
    const matchSearch = !q ||
      a.airlineName.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  return (
    <div className="space-y-3">

      {/* ── Sticky search + filter card ── */}
      <div className="sticky top-0 z-20 card p-4 space-y-3 shadow-md bg-white">
        {/* Search bar */}
        <div className="relative">
          <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search airline name or email…"
            className="input-field pl-9 pr-8 w-full text-sm"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-primary-400 hover:text-primary-600">
              <HiOutlineX className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map(f => {
            const count =
              f.key === 'all'     ? airlines.length :
              f.key === 'sent'    ? airlines.filter(a => a.contractSent).length :
              airlines.filter(a => !a.contractSent).length;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filter === f.key
                    ? 'bg-primary-800 text-white'
                    : 'text-primary-500 hover:bg-primary-100 border border-primary-100'
                }`}
              >
                {f.label}
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  filter === f.key ? 'bg-white/20 text-white' : 'bg-primary-100 text-primary-500'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
          {(search || filter !== 'all') && (
            <span className="ml-auto text-[11px] text-primary-400">
              {visible.length} result{visible.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* ── Scrollable airlines list card ── */}
      <div className="card overflow-hidden">
        <div className="overflow-y-auto divide-y divide-primary-100" style={{ maxHeight: 'calc(100vh - 320px)', minHeight: '120px' }}>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : !visible.length ? (
            <div className="py-14 text-center text-primary-400 text-sm">
              {airlines.length === 0
                ? 'No airlines found. Add airlines first.'
                : 'No airlines match your search or filter.'}
            </div>
          ) : visible.map(airline => (
            <div key={airline.id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 hover:bg-primary-50/60 transition-colors">

              {/* Top row on mobile: icon + info + status badge */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center overflow-hidden">
                  {airline.logoUrl
                    ? <img src={airline.logoUrl} alt={airline.airlineName} className="w-full h-full object-contain p-0.5" />
                    : <HiOutlineOfficeBuilding className="w-5 h-5 text-primary-600" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-primary-800 truncate">{airline.airlineName}</p>
                  <p className="text-xs text-primary-400 truncate">{airline.email}</p>
                  {/* Mobile-only status inline */}
                  <div className="sm:hidden mt-1">
                    {airline.contractSent ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700">
                        <HiOutlineCheckCircle className="w-3 h-3" />
                        Sent · {airline.contractEmail}
                        {airline.contractSentAt && ` · ${new Date(airline.contractSentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary-400">
                        <HiOutlineClock className="w-3 h-3" /> Not sent
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Desktop status column */}
              <div className="hidden sm:flex flex-col items-end gap-0.5 flex-shrink-0 w-[175px]">
                {airline.contractSent ? (
                  <>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 border border-green-200">
                      <HiOutlineCheckCircle className="w-3.5 h-3.5 text-green-600" />
                      <span className="text-[11px] font-semibold text-green-700">Contract sent</span>
                    </div>
                    {airline.contractEmail && (
                      <span className="text-[10px] text-primary-400 truncate max-w-[175px]">
                        → {airline.contractEmail}
                      </span>
                    )}
                    {airline.contractSentAt && (
                      <span className="text-[10px] text-primary-400">
                        {new Date(airline.contractSentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-50 border border-primary-200">
                    <HiOutlineClock className="w-3.5 h-3.5 text-primary-400" />
                    <span className="text-[11px] font-semibold text-primary-500">Not sent</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0 sm:pl-0 pl-12">
                {airline.contractSent ? (
                  <>
                    <button
                      onClick={() => onViewContract(airline)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary-200 text-xs font-semibold text-primary-600 hover:bg-primary-100 transition-colors"
                    >
                      <HiOutlineEye className="w-4 h-4" />
                      <span className="hidden xs:inline sm:inline">View</span>
                    </button>
                    <button
                      onClick={() => onCreateContract(airline)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
                    >
                      <HiOutlineRefresh className="w-4 h-4" />
                      <span className="hidden xs:inline sm:inline">Resend</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => onCreateContract(airline)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-800 text-white text-xs font-semibold hover:bg-primary-900 transition-colors shadow-sm"
                  >
                    <HiOutlinePencil className="w-4 h-4" />
                    <span>Create Contract</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Contract editor view ──────────────────────────────────────────────────────
function ContractEditor({ airline, onBack, onSent }) {
  const [blocks, setBlocks]         = useState(null);
  const [headerDate, setHeaderDate] = useState('OCTOBER 2024');
  const [appliedName, setAppliedName] = useState('');
  const [appliedAddr, setAppliedAddr] = useState('');
  const [toEmail, setToEmail]       = useState(airline?.email || '');
  const [message, setMessage]       = useState('');
  const [extraBlocks, setExtraBlocks] = useState([]);
  const [previewUrl, setPreviewUrl]   = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending]       = useState(false);
  const imageInputRef = useRef(null);

  useEffect(() => {
    const loader = airline?.id
      ? getContractDefaultsForAirline(airline.id)
      : getContractDefaults();

    loader
      .then(res => {
        setBlocks(res.data.blocks);
        setAppliedName(res.data.meta?.clientName || '');
        setAppliedAddr(res.data.meta?.clientAddress || '');
        if (res.data.meta?.headerDate) setHeaderDate(res.data.meta.headerDate);
        if (airline?.email) setToEmail(airline.email);
      })
      .catch(() => toast.error('Failed to load contract content'));
  }, [airline?.id]);

  const updateBlock = (id, text) =>
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, text } : b));

  const applyBold = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { toast.error('Select text to highlight first'); return; }
    const range = sel.getRangeAt(0);
    const selected = range.toString();
    if (!selected) { toast.error('Select text to highlight first'); return; }
    const mark = document.createElement('mark');
    mark.className = 'hl-mark';
    mark.textContent = selected;
    range.deleteContents();
    range.insertNode(mark);
    mark.closest('[contenteditable]')?.dispatchEvent(new Event('input', { bubbles: true }));
    sel.removeAllRanges();
  };

  const addTextBlock  = () => setExtraBlocks(prev => [...prev, { type: 'text', content: '' }]);
  const addImageBlock = () => imageInputRef.current?.click();
  const onImageChosen = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error('Image must be under 3 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setExtraBlocks(prev => [...prev, { type: 'image', dataUrl: reader.result, name: file.name }]);
    reader.readAsDataURL(file);
  };
  const updateExtra = (i, content) => setExtraBlocks(prev => prev.map((b, idx) => idx === i ? { ...b, content } : b));
  const removeExtra = (i) => setExtraBlocks(prev => prev.filter((_, idx) => idx !== i));

  const buildPayload = () => ({
    blocks,
    headerDate,
    extraBlocks: extraBlocks.map(b => b.type === 'image'
      ? { type: 'image', dataUrl: b.dataUrl }
      : { type: 'text', content: b.content }),
  });

  const handlePreview = async () => {
    if (!blocks) return;
    setLoadingPreview(true);
    try {
      const res  = await previewContract(buildPayload());
      const blob = new Blob([res.data], { type: 'application/pdf' });
      if (previewUrl) window.URL.revokeObjectURL(previewUrl);
      setPreviewUrl(window.URL.createObjectURL(blob));
    } catch {
      toast.error('Failed to generate preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) window.URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const handleSend = async () => {
    if (!toEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail.trim())) {
      toast.error('Enter a valid recipient email');
      return;
    }
    setSending(true);
    try {
      const res = await sendContract({
        ...buildPayload(),
        toEmail: toEmail.trim(),
        clientName: appliedName || undefined,
        airlineId: airline?.id || undefined,
        message: message.trim() || undefined,
      });
      toast.success(res.data.message || 'Contract sent');
      onSent?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send contract');
    } finally {
      setSending(false);
    }
  };

  if (!blocks) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Back + airline context */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary-200 text-xs font-semibold text-primary-600 hover:bg-primary-100 transition-colors">
          <HiOutlineArrowLeft className="w-4 h-4" /> Back to Airlines
        </button>
        {airline && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-50 border border-primary-100">
            <HiOutlineOfficeBuilding className="w-4 h-4 text-primary-500" />
            <span className="text-xs font-semibold text-primary-700">{airline.airlineName}</span>
          </div>
        )}
      </div>

      {/* Recipient + header date */}
      <div className="card p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <HiOutlineOfficeBuilding className="w-5 h-5 text-primary-500" />
          <h3 className="text-base font-bold text-primary-800">Recipient &amp; Document</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Send To Email</label>
            <div className="relative">
              <HiOutlineMail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
              <input type="email" value={toEmail} onChange={e => setToEmail(e.target.value)}
                placeholder="recipient@email.com" className="input-field pl-10 w-full" />
            </div>
          </div>
          <div>
            <label className="label">Header Date <span className="text-amber-500 normal-case font-medium">· top-right of every page</span></label>
            <div className="relative">
              <HiOutlineCalendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
              <input type="text" value={headerDate} onChange={e => setHeaderDate(e.target.value)}
                placeholder="OCTOBER 2024" className="input-field pl-10 w-full" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Email Message (optional)</label>
            <input type="text" value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Custom note in the email body…" className="input-field w-full" />
          </div>
        </div>
      </div>

      {/* Contract content */}
      <div className="card p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <HiOutlineDocumentText className="w-5 h-5 text-primary-500" />
          <h3 className="text-base font-bold text-primary-800">Contract Content</h3>
        </div>
        <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 border border-blue-100">
          <HiOutlineLightBulb className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 leading-relaxed">
            <strong className="px-1 rounded hl-mark">Highlighted</strong> boxes are dynamic values — type directly into them.
            To mark more text as dynamic, select it in any text block and click <strong>Bold</strong>.
          </p>
        </div>

        <div className="rounded-2xl border border-primary-100 bg-primary-50/30 p-3 sm:p-4 space-y-2.5">
          {blocks.map((b) => {
            if (STRUCTURAL[b.type]) {
              return (
                <div key={b.id} className="flex items-center gap-2 py-1">
                  <div className="flex-1 h-px bg-primary-200/70" />
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary-300">
                    {b.type === 'sigimage'
                      ? <><HiOutlinePencilAlt className="w-3 h-3" /> Signature image</>
                      : 'spacing'}
                  </span>
                  <div className="flex-1 h-px bg-primary-200/70" />
                </div>
              );
            }
            return (
              <div key={b.id}>
                <BlockEditor
                  block={b}
                  onTextChange={val => updateBlock(b.id, val)}
                  onFocus={() => {}}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Extra pages */}
      <div className="card p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <HiOutlinePhotograph className="w-5 h-5 text-primary-500" />
            <h3 className="text-base font-bold text-primary-800">Additional Pages</h3>
          </div>
          <div className="flex gap-2">
            <button onClick={addTextBlock}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary-200 text-xs font-semibold text-primary-600 hover:bg-primary-100 transition-colors">
              <HiOutlineDocumentText className="w-4 h-4" /> Add Text Page
            </button>
            <button onClick={addImageBlock}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary-200 text-xs font-semibold text-primary-600 hover:bg-primary-100 transition-colors">
              <HiOutlinePhotograph className="w-4 h-4" /> Add Image
            </button>
            <input ref={imageInputRef} type="file" accept="image/*" onChange={onImageChosen} className="hidden" />
          </div>
        </div>

        {extraBlocks.length === 0 && (
          <p className="text-xs text-primary-400">No extra pages. Long text flows onto new pages automatically; each image gets its own page.</p>
        )}

        <div className="space-y-3">
          {extraBlocks.map((b, i) => (
            <div key={i} className="rounded-xl border border-primary-100 bg-primary-50/40 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary-400">
                  Extra Page {i + 1} · {b.type === 'image' ? 'Image' : 'Text'}
                </span>
                <button onClick={() => removeExtra(i)} className="p-1 rounded-lg text-primary-400 hover:text-red-500 hover:bg-red-50">
                  <HiOutlineTrash className="w-4 h-4" />
                </button>
              </div>
              {b.type === 'image' ? (
                <div className="flex items-center gap-3">
                  <img src={b.dataUrl} alt={b.name} className="w-20 h-20 object-contain rounded-lg border border-primary-200 bg-white" />
                  <p className="text-sm text-primary-600 truncate">{b.name}</p>
                </div>
              ) : (
                <textarea value={b.content} onChange={e => updateExtra(i, e.target.value)} rows={4}
                  placeholder="Type the content for this page…"
                  className="input-field w-full resize-y" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-3 z-20">
        <div className="flex flex-wrap items-center justify-end gap-3 px-4 sm:px-5 py-3 rounded-2xl bg-white/90 backdrop-blur border border-primary-200 shadow-lg">
          <button onClick={applyBold}
            title="Select text in any block, then click Bold"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-sm font-bold text-amber-800 hover:bg-amber-100 transition-colors">
            B Bold
          </button>
          <div className="w-px h-6 bg-primary-200" />
          <button onClick={handlePreview} disabled={loadingPreview}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-primary-300 text-sm font-semibold text-primary-700 hover:bg-primary-100 disabled:opacity-60">
            {loadingPreview
              ? <div className="w-4 h-4 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
              : <HiOutlineEye className="w-5 h-5" />}
            {loadingPreview ? 'Generating…' : 'Preview PDF'}
          </button>
          <button onClick={handleSend} disabled={sending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-800 text-white text-sm font-semibold hover:bg-primary-900 disabled:opacity-60 shadow-sm">
            {sending
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <HiOutlinePaperAirplane className="w-5 h-5" />}
            {sending ? 'Sending…' : 'Send Contract'}
          </button>
        </div>
      </div>

      {/* Preview modal */}
      <AnimatePresence>
        {previewUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm"
            onClick={closePreview}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-primary-200">
                <p className="text-sm sm:text-base font-bold text-primary-800">Contract Preview</p>
                <div className="flex items-center gap-2">
                  <a href={previewUrl} download="Services_Agreement.pdf"
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary-800 text-white hover:bg-primary-900">Download</a>
                  <button onClick={closePreview} className="p-2 rounded-lg hover:bg-primary-100 text-primary-400"><HiOutlineX className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="bg-primary-50" style={{ height: '72vh' }}>
                <iframe src={previewUrl} title="Contract Preview" className="w-full h-full border-0" />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────
export default function Contract() {
  const [view, setView]             = useState('list'); // 'list' | 'editor'
  const [airlines, setAirlines]     = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedAirline, setSelectedAirline] = useState(null);
  const [viewPdfUrl, setViewPdfUrl] = useState(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const fetchAirlines = useCallback(() => {
    setLoadingList(true);
    getContractAirlines()
      .then(res => setAirlines(res.data))
      .catch(() => toast.error('Failed to load airlines'))
      .finally(() => setLoadingList(false));
  }, []);

  useEffect(() => { fetchAirlines(); }, [fetchAirlines]);

  const handleCreateContract = (airline) => {
    setSelectedAirline(airline);
    setView('editor');
  };

  const handleViewContract = async (airline) => {
    if (!airline.contractId) return;
    setLoadingPdf(true);
    try {
      const res  = await getContractPdf(airline.contractId);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      if (viewPdfUrl) window.URL.revokeObjectURL(viewPdfUrl);
      setViewPdfUrl(window.URL.createObjectURL(blob));
    } catch {
      toast.error('Failed to load contract PDF');
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleBack = () => {
    setView('list');
    setSelectedAirline(null);
  };

  const handleSent = () => {
    fetchAirlines();
    setView('list');
    setSelectedAirline(null);
  };

  const closePdfModal = () => {
    if (viewPdfUrl) window.URL.revokeObjectURL(viewPdfUrl);
    setViewPdfUrl(null);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-5 sm:space-y-6 px-0 pb-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-700 to-primary-900 flex items-center justify-center shadow-sm">
          <HiOutlineDocumentText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-primary-800">Contracts</h1>
          <p className="text-xs sm:text-sm text-primary-400 mt-0.5">
            {view === 'list'
              ? 'Manage & send contracts to airlines'
              : `Editing contract for ${selectedAirline?.airlineName || 'airline'}`}
          </p>
        </div>
      </div>

      {view === 'list' ? (
        <AirlinesList
          airlines={airlines}
          loading={loadingList}
          onCreateContract={handleCreateContract}
          onViewContract={handleViewContract}
        />
      ) : (
        <ContractEditor
          airline={selectedAirline}
          onBack={handleBack}
          onSent={handleSent}
        />
      )}

      {/* View sent contract PDF modal */}
      <AnimatePresence>
        {(viewPdfUrl || loadingPdf) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm"
            onClick={closePdfModal}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-primary-200">
                <p className="text-sm sm:text-base font-bold text-primary-800">Sent Contract</p>
                <div className="flex items-center gap-2">
                  {viewPdfUrl && (
                    <a href={viewPdfUrl} download="Contract.pdf"
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary-800 text-white hover:bg-primary-900">Download</a>
                  )}
                  <button onClick={closePdfModal} className="p-2 rounded-lg hover:bg-primary-100 text-primary-400"><HiOutlineX className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="bg-primary-50 flex items-center justify-center" style={{ height: '72vh' }}>
                {loadingPdf
                  ? <div className="w-8 h-8 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
                  : <iframe src={viewPdfUrl} title="Sent Contract" className="w-full h-full border-0" />
                }
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
