import { boutDetail, bouts, fencers, poule } from './poule';

describe('fixture da poule', () => {
  it('tem n(n-1)/2 assaltos para 6 atletas', () => {
    expect(fencers).toHaveLength(6);
    expect(bouts).toHaveLength(15);
    expect(poule.bouts_total).toBe(15);
  });

  it('numera as sequências de 1 a N, sem saltos', () => {
    expect(bouts.map((b) => b.sequence)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  it('cobre todos os pares uma só vez — todos contra todos', () => {
    const pairs = bouts.map((b) => [b.fencer_a.number, b.fencer_b.number].sort().join('-'));
    expect(new Set(pairs).size).toBe(15);
  });

  it('só tem resultado nos assaltos `done`', () => {
    for (const bout of bouts) {
      if (bout.status === 'done') {
        expect(bout.score_a).not.toBeNull();
        expect(bout.score_b).not.toBeNull();
        // Não há empates em poule.
        expect(bout.score_a).not.toBe(bout.score_b);
      } else {
        expect(bout.score_a).toBeNull();
        expect(bout.score_b).toBeNull();
      }
    }
  });

  it('devolve o detalhe de um assalto com os presets da poule', () => {
    const first = bouts[0];
    expect(first).toBeDefined();

    const detail = boutDetail(first!.id);
    expect(detail).toMatchObject({
      id: first!.id,
      target: poule.touch_cap,
      duration_seconds: poule.duration_seconds,
      allow_draw: false,
      poule_locked: false,
    });
  });

  it('devolve undefined para um id desconhecido', () => {
    expect(boutDetail('b_inexistente')).toBeUndefined();
  });
});
