/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import ReactDOM from 'react-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ObservabilityRuleTypeRegistry } from '@kbn/observability-plugin/public';
import type { AppMountParameters, CoreStart } from '@kbn/core/public';
import { APP_WRAPPER_CLASS } from '@kbn/core/public';
import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';
import { KibanaThemeProvider } from '@kbn/react-kibana-context-theme';
import type { ConfigSchema } from '..';
import type { ApmPluginSetupDeps, ApmPluginStartDeps, ApmServices } from '../plugin';
import { createCallApmApi } from '../services/rest/create_call_apm_api';
import { setHelpExtension } from '../set_help_extension';
import { setReadonlyBadge } from '../update_badge';
import { ApmAppRoot } from '../components/routing/app_root';
import type { KibanaEnvContext } from '../context/kibana_environment_context/kibana_environment_context';

/**
 * This module is rendered asynchronously in the Kibana platform.
 */
export const renderApp = ({
  coreStart,
  pluginsSetup,
  appMountParameters,
  config,
  pluginsStart,
  observabilityRuleTypeRegistry,
  apmServices,
  kibanaEnvironment,
}: {
  coreStart: CoreStart;
  pluginsSetup: ApmPluginSetupDeps;
  appMountParameters: AppMountParameters;
  config: ConfigSchema;
  pluginsStart: ApmPluginStartDeps;
  observabilityRuleTypeRegistry: ObservabilityRuleTypeRegistry;
  apmServices: ApmServices;
  kibanaEnvironment: KibanaEnvContext;
}) => {
  const { element, theme$ } = appMountParameters;
  const apmPluginContextValue = {
    appMountParameters,
    config,
    core: coreStart,
    plugins: pluginsSetup,
    data: pluginsStart.data,
    inspector: pluginsStart.inspector,
    observability: pluginsStart.observability,
    observabilityShared: pluginsStart.observabilityShared,
    observabilityRuleTypeRegistry,
    dataViews: pluginsStart.dataViews,
    unifiedSearch: pluginsStart.unifiedSearch,
    lens: pluginsStart.lens,
    uiActions: pluginsStart.uiActions,
    observabilityAIAssistant: pluginsStart.observabilityAIAssistant,
    share: pluginsSetup.share,
    kibanaEnvironment,
    licensing: pluginsStart.licensing,
  };
  const queryClient = new QueryClient();

  // render APM feedback link in global help menu
  setHelpExtension(coreStart);
  setReadonlyBadge(coreStart);
  createCallApmApi(coreStart);

  // add .kbnAppWrappers class to root element
  element.classList.add(APP_WRAPPER_CLASS);

  ReactDOM.render(
    <KibanaRenderContextProvider {...coreStart}>
      <KibanaThemeProvider
        theme={{ theme$ }}
        modify={{
          breakpoint: {
            xxl: 1600,
            xxxl: 2000,
          },
        }}
      >
        <QueryClientProvider client={queryClient}>
          <ApmAppRoot
            apmPluginContextValue={apmPluginContextValue}
            pluginsStart={pluginsStart}
            apmServices={apmServices}
          />
        </QueryClientProvider>
      </KibanaThemeProvider>
    </KibanaRenderContextProvider>,
    element
  );
  return () => {
    ReactDOM.unmountComponentAtNode(element);
  };
};
