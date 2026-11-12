// Web Audio API Synthesizer for Kitingo Voice Calls (Banca <-> Estafeta <-> Cliente)

class KitingoCallAudioEngine {
  private ctx: AudioContext | null = null;
  private ringTimer: ReturnType<typeof setTimeout> | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playDialAndConnectSound(onConnected?: () => void): void {
    this.stopRinging();
    const ctx = this.getContext();
    if (!ctx) {
      if (onConnected) {
        this.ringTimer = setTimeout(onConnected, 1200);
      }
      return;
    }

    try {
      const now = ctx.currentTime;
      // Pulse 1: Standard Angola/European 425 Hz GSM Ringback Tone
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(425, now);

      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.exponentialRampToValueAtTime(0.08, now + 0.04);
      gain1.gain.setValueAtTime(0.08, now + 0.55);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.62);

      // Pulse 2: Connected confirmation dual-tone chime (587 Hz -> 880 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(587.33, now + 0.85);
      osc2.frequency.setValueAtTime(880, now + 0.98);

      gain2.gain.setValueAtTime(0.001, now + 0.85);
      gain2.gain.exponentialRampToValueAtTime(0.09, now + 0.88);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 1.18);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.85);
      osc2.stop(now + 1.2);
    } catch {
      // Ignore if browser audio policy blocks autoplay
    }

    if (onConnected) {
      this.ringTimer = setTimeout(onConnected, 1100);
    }
  }

  public playMessageSentBeep(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(740, now);
      osc.frequency.setValueAtTime(987.77, now + 0.08);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch {
      // ignore
    }
  }

  public playHangupTone(): void {
    this.stopRinging();
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.setValueAtTime(360, now + 0.1);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
    } catch {
      // ignore
    }
  }

  public stopRinging(): void {
    if (this.ringTimer) {
      clearTimeout(this.ringTimer);
      this.ringTimer = null;
    }
  }
}

export const kitingoCallAudio = new KitingoCallAudioEngine();

export function getDefaultQuickMessagesForTarget(
  target: 'BANCA' | 'ESTAFETA' | 'CLIENTE'
): string[] {
  if (target === 'BANCA') {
    return [
      'Estou na entrada da Praça dos Correios, qual é o corredor da banca?',
      'Cheguei à banca, tenho o código OTP pronto para recolher a peça.',
      'Por favor confirme se a peça já está separada para conferência com a amostra.',
    ];
  }
  if (target === 'ESTAFETA') {
    return [
      'A peça já está separada e testada no balcão da banca, pode avançar.',
      'Estamos no Corredor Central da Praça dos Correios (Banca #08).',
      'Apresente o código OTP de 4 dígitos à chegada para libertarmos a recolha.',
    ];
  }
  return [
    'Já recolhi a peça na banca, estou a caminho do seu local de entrega.',
    'Estou a chegar ao endereço indicado no GPS, prepare o PIN de 4 dígitos.',
    'Estou junto ao ponto de referência na Maianga.',
  ];
}

export function getSimulatedVoiceReply(
  target: 'BANCA' | 'ESTAFETA' | 'CLIENTE',
  customPrompt?: string
): string {
  if (target === 'BANCA') {
    if (customPrompt?.toLowerCase().includes('corredor')) {
      return 'Banca #08 (Sr. José): "Estamos no Corredor Central da Praça dos Correios, portão 2 à direita. A peça já está em cima do balcão!"';
    }
    return 'Banca #08 (Sr. José): "Alô! A peça já foi conferida com a foto da amostra do cliente e está pronta para recolha mediante OTP."';
  }
  if (target === 'ESTAFETA') {
    if (customPrompt?.toLowerCase().includes('otp')) {
      return 'Estafeta Paulo Sebastião (#EST-019): "Perfeito! Já tenho o código OTP 0018 no ecrã do telemóvel, chego ao balcão em 1 minuto."';
    }
    return 'Estafeta Paulo Sebastião (#EST-019): "Alô! Aceitei a recolha e estou a entrar na Praça dos Correios na motorizada LD-44-92-AO."';
  }
  return 'Cliente João Baptista: "Alô estafeta! Estou a aguardar no Largo da Maianga com o código PIN 2437 pronto para receber a peça."';
}
