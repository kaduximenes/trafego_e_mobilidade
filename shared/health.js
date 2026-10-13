// Handler de /healthz, compartilhado entre o servidor de produção (Express) e o
// de desenvolvimento (Vite).
//
// Motivo de existir: o diagnóstico mais importante daqui é descobrir QUAL driver
// de histórico está ativo. Sem ele no dev, a verificação documentada no README
// (`/healthz` mostrando `driver: "postgres"`) só funcionaria em produção — e era
// exatamente onde o erro apareceria mais tarde.

import { getHistoryConfig, getRetentionConfig } from './history/metricStore.js'

export function createHealthHandler(env = {}) {
  return (_req, res) => {
    const history = getHistoryConfig(env)
    const retention = getRetentionConfig(env)

    const payload = {
      status: 'ok',
      antaresKeyConfigured: Boolean(env.ANTARES_API_KEY),
      wazeFeedConfigured: Boolean(env.WAZE_FEED_URL),
      // Diagnóstico do histórico: sem DATABASE_URL a coleta grava em arquivo, que
      // NÃO sobrevive a deploy em hospedagem com disco efêmero.
      history: {
        driver: history.driver,
        persistent: history.driver === 'postgres',
        collectSecretConfigured: Boolean(env.COLLECT_SECRET),
        collectScheduleEndpoint: '/api/collect',
        retentionDays: retention.enabled ? retention.days : null,
      },
    }

    // API crua do Node (e não res.json): este handler roda tanto no Express
    // (produção) quanto no middleware do Vite (dev), e o `res` do Connect não
    // tem os atalhos do Express.
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(payload))
  }
}
