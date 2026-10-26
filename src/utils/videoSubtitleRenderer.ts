import {
  SubtitleCue,
  SubtitleStyleConfig,
  normalizeSubtitleText,
} from './subtitleEngine';

export interface RenderedCueOverlay {
  cueId: string;
  startTime: number;
  endTime: number;
  pngBase64: string;
}

/**
 * Renders a single SubtitleCue onto a transparent canvas of exact native video dimensions
 * (width x height) so FFmpeg can composite it with 100% browser-accurate Bangla/English fonts.
 */
export function renderCueToTransparentPng(
  cue: SubtitleCue,
  styleConfig: SubtitleStyleConfig,
  width: number,
  height: number
): string | null {
  const bnText = normalizeSubtitleText(cue.textBn);
  const enText = normalizeSubtitleText(cue.textEn);

  const lines: { text: string; isBn: boolean }[] = [];
  if (styleConfig.displayMode === 'bn' && bnText) {
    lines.push({ text: bnText, isBn: true });
  } else if (styleConfig.displayMode === 'en' && enText) {
    lines.push({ text: enText, isBn: false });
  } else if (styleConfig.displayMode === 'bilingual') {
    if (styleConfig.primaryOrder === 'bn-top') {
      if (bnText) lines.push({ text: bnText, isBn: true });
      if (enText) lines.push({ text: enText, isBn: false });
    } else {
      if (enText) lines.push({ text: enText, isBn: false });
      if (bnText) lines.push({ text: bnText, isBn: true });
    }
  }

  if (lines.length === 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);

  // Scale typography proportionally to native video height (reference 540p stage)
  const scaleFactor = height / 540;
  const basePx = Math.max(18, Math.round(styleConfig.fontSize * scaleFactor));
  const lineHeight = basePx * 1.48;
  const boxPaddingX = Math.round(24 * scaleFactor);
  const boxPaddingY = Math.round(12 * scaleFactor);
  const totalTextHeight = lines.length * lineHeight;
  const bottomY = height - (height * styleConfig.bottomOffset) / 100;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let maxWidth = Math.round(220 * scaleFactor);
  for (const l of lines) {
    const fontPx = l.isBn ? basePx : Math.round(basePx * 0.85);
    const fontFamily = l.isBn
      ? styleConfig.banglaFont
      : styleConfig.englishFont;
    ctx.font = `${styleConfig.fontWeight} ${fontPx}px "${fontFamily}", sans-serif`;
    const measured = ctx.measureText(l.text);
    if (measured.width > maxWidth) {
      maxWidth = measured.width;
    }
  }

  const boxW = Math.min(width - Math.round(64 * scaleFactor), maxWidth + boxPaddingX * 2);
  const boxH = totalTextHeight + boxPaddingY * 2;
  const boxX = (width - boxW) / 2;
  const boxY = bottomY - boxH;

  if (styleConfig.bgOpacity > 0) {
    ctx.fillStyle = `rgba(9, 13, 22, ${styleConfig.bgOpacity / 100})`;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, Math.round(8 * scaleFactor));
    ctx.fill();
  }

  lines.forEach((l, idx) => {
    const fontPx = l.isBn ? basePx : Math.round(basePx * 0.85);
    const fontFamily = l.isBn
      ? styleConfig.banglaFont
      : styleConfig.englishFont;
    ctx.font = `${styleConfig.fontWeight} ${fontPx}px "${fontFamily}", sans-serif`;
    const ly = boxY + boxPaddingY + (idx + 0.5) * lineHeight;

    if (styleConfig.textOutline) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
      ctx.lineWidth = Math.max(2, Math.round(3.5 * scaleFactor));
      ctx.lineJoin = 'round';
      ctx.strokeText(l.text, width / 2, ly);
    }

    ctx.fillStyle = l.isBn ? styleConfig.bnColor : styleConfig.enColor;
    ctx.fillText(l.text, width / 2, ly);
  });

  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.replace(/^data:image\/png;base64,/, '');
}

/**
 * Generates all native-resolution transparent PNG overlays for the active subtitle timeline.
 */
export async function renderAllCuesToTransparentPngs(
  cues: SubtitleCue[],
  styleConfig: SubtitleStyleConfig,
  width: number,
  height: number
): Promise<RenderedCueOverlay[]> {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const overlays: RenderedCueOverlay[] = [];
  for (const cue of cues) {
    const pngBase64 = renderCueToTransparentPng(cue, styleConfig, width, height);
    if (pngBase64) {
      overlays.push({
        cueId: cue.id,
        startTime: cue.startTime,
        endTime: cue.endTime,
        pngBase64,
      });
    }
  }
  return overlays;
}
