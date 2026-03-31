import { loadSidebarAnalysis } from '../analysis.js';
import { renderScanReport } from '../reporting.js';

export async function getScanData(options = {}) {
  return loadSidebarAnalysis(options);
}

export async function runScan(options = {}) {
  const data = await getScanData(options);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          codexHome: data.context.codexHome,
          defaultProvider: data.context.defaultProvider,
          authMode: data.context.auth.auth_mode || null,
          report: data.report
        },
        null,
        2
      )
    );
    return data.report;
  }

  console.log(renderScanReport(data.report, { limit: options.limit || 30 }));
  return data.report;
}
