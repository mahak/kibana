/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { findTestSubject } from '@elastic/eui/lib/test';
import { mountWithIntl } from '@kbn/test-jest-helpers'; // eslint-disable-line no-unused-vars
import { init as initHttpRequests } from '../client_integration/helpers/http_requests';

import { BASE_PATH } from '../../common/constants';
import { AppWithoutRouter } from '../../public/application/app';
import { AppContextProvider } from '../../public/application/app_context';
import { loadIndicesSuccess } from '../../public/application/store/actions';
import { breadcrumbService } from '../../public/application/services/breadcrumbs';
import { UiMetricService } from '../../public/application/services/ui_metric';
import { notificationService } from '../../public/application/services/notification';
import { httpService } from '../../public/application/services/http';
import { setUiMetricService } from '../../public/application/services/api';
import { indexManagementStore } from '../../public/application/store';
import { setExtensionsService } from '../../public/application/store/selectors/extension_service';
import { ExtensionsService } from '../../public/services';
import { kibanaVersion } from '../client_integration/helpers';

import {
  notificationServiceMock,
  executionContextServiceMock,
  chromeServiceMock,
} from '@kbn/core/public/mocks';

let store = null;
const indices = [];

const getBaseFakeIndex = (isOpen) => {
  return {
    health: isOpen ? 'green' : 'yellow',
    status: isOpen ? 'open' : 'closed',
    primary: 1,
    replica: 1,
    documents: 10000,
    documents_deleted: 100,
    size: '156kb',
    primary_size: '156kb',
  };
};

jest.mock('react-use/lib/useObservable', () => () => jest.fn());

for (let i = 0; i < 105; i++) {
  indices.push({
    ...getBaseFakeIndex(true),
    name: `testy${i}`,
  });
  indices.push({
    ...getBaseFakeIndex(false),
    name: `.admin${i}`,
    // Add 2 hidden indices in the list in position 3 & 7
    // note: for each loop iteration we add 2 indices
    hidden: i === 1 || i === 3 ? true : false, // ".admin1" and ".admin3" are the only hidden in 8.x
  });
}

const urlServiceMock = {
  locators: {
    get: () => ({
      navigate: async () => {},
    }),
  },
};

let component = null;

// Resolve outstanding API requests. See https://www.benmvp.com/blog/asynchronous-testing-with-enzyme-react-jest/
const runAllPromises = () => new Promise(setImmediate);

const status = (rendered, row = 0) => {
  rendered.update();
  return findTestSubject(rendered, 'indexTableCell-status')
    .at(row)
    .find('div.euiTableCellContent')
    .text();
};

const snapshot = (rendered) => {
  expect(rendered).toMatchSnapshot();
};

const names = (rendered) => {
  return findTestSubject(rendered, 'indexTableIndexNameLink');
};

const namesText = (rendered) => {
  return names(rendered).map((button) => button.text());
};

const openMenuAndClickButton = (rendered, rowIndex, buttonSelector) => {
  // Select a row.
  const checkboxes = findTestSubject(rendered, 'indexTableRowCheckbox');
  checkboxes.at(rowIndex).simulate('change', { target: { checked: true } });
  rendered.update();

  // Click the bulk actions button to open the context menu.
  const actionButton = findTestSubject(rendered, 'indexActionsContextMenuButton');
  actionButton.simulate('click');
  rendered.update();

  // Click an action in the context menu.
  const contextMenuButton = findTestSubject(rendered, buttonSelector);
  contextMenuButton.simulate('click');
  rendered.update();
};

const testAction = (rendered, buttonSelector, indexName = 'testy0') => {
  const rowIndex = namesText(rendered).indexOf(indexName);
  // This is leaking some implementation details about how Redux works. Not sure exactly what's going on
  // but it looks like we're aware of how many Redux actions are dispatched in response to user interaction,
  // so we "time" our assertion based on how many Redux actions we observe. This is brittle because it
  // depends upon how our UI is architected, which will affect how many actions are dispatched.
  // Expect this to break when we rearchitect the UI.
  // Update: Expect this to be removed when we rearchitect the UI :)
  let dispatchedActionsCount = 0;
  store.subscribe(() => {
    if (dispatchedActionsCount === 1) {
      // Take snapshot of final state.
      snapshot(status(rendered, rowIndex));
    }
    dispatchedActionsCount++;
  });

  openMenuAndClickButton(rendered, rowIndex, buttonSelector);
  // take snapshot of initial state.
  snapshot(status(rendered, rowIndex));
};

const getActionMenuButtons = (rendered) => {
  return findTestSubject(rendered, 'indexContextMenu')
    .find('button')
    .map((span) => span.text());
};
describe('index table', () => {
  const { httpSetup, httpRequestsMockHelpers } = initHttpRequests();

  const setupMockComponent = (dependenciesOverride) => {
    // Mock initialization of services
    const services = {
      extensionsService: new ExtensionsService(),
      uiMetricService: new UiMetricService('index_management'),
    };
    services.uiMetricService.setup({ reportUiCounter() {} });
    setExtensionsService(services.extensionsService);
    setUiMetricService(services.uiMetricService);

    httpService.setup(httpSetup);
    breadcrumbService.setup(() => undefined);
    notificationService.setup(notificationServiceMock.createStartContract());

    store = indexManagementStore(services);

    const appDependencies = {
      services,
      core: {
        getUrlForApp: () => {},
        executionContext: executionContextServiceMock.createStartContract(),
        chrome: chromeServiceMock.createStartContract(),
      },
      plugins: {},
      url: urlServiceMock,
      // Default stateful configuration
      config: {
        enableLegacyTemplates: true,
        enableIndexActions: true,
        enableIndexStats: true,
      },
      privs: {
        monitor: true,
        manageEnrich: true,
        monitorEnrich: true,
      },
    };

    component = (
      <Provider store={store}>
        <MemoryRouter initialEntries={[`${BASE_PATH}indices`]}>
          <AppContextProvider value={{ ...appDependencies, ...dependenciesOverride }}>
            <AppWithoutRouter />
          </AppContextProvider>
        </MemoryRouter>
      </Provider>
    );

    store.dispatch(loadIndicesSuccess({ indices }));
  };

  beforeEach(() => {
    // Mock initialization of services
    setupMockComponent();

    httpRequestsMockHelpers.setLoadIndicesResponse(indices);
    httpRequestsMockHelpers.setReloadIndicesResponse(indices);
  });

  test('should change pages when a pagination link is clicked on', async () => {
    const rendered = mountWithIntl(component);
    await runAllPromises();
    rendered.update();

    snapshot(namesText(rendered));

    const pagingButtons = rendered.find('.euiPaginationButton');
    pagingButtons.at(2).simulate('click');
    snapshot(namesText(rendered));
  });

  test('should show more when per page value is increased', async () => {
    const rendered = mountWithIntl(component);
    await runAllPromises();
    rendered.update();

    const perPageButton = rendered.find('EuiTablePagination EuiPopover').find('button');
    perPageButton.simulate('click');
    rendered.update();

    const fiftyButton = rendered.find('button.euiContextMenuItem').at(1);
    fiftyButton.simulate('click');
    rendered.update();
    expect(namesText(rendered).length).toBe(50);
  });

  test('should show the Actions menu button only when at least one row is selected', async () => {
    const rendered = mountWithIntl(component);
    await runAllPromises();
    rendered.update();

    let button = findTestSubject(rendered, 'indexActionsContextMenuButton');
    expect(button.length).toEqual(0);

    const checkboxes = findTestSubject(rendered, 'indexTableRowCheckbox');
    checkboxes.at(0).simulate('change', { target: { checked: true } });
    rendered.update();
    button = findTestSubject(rendered, 'indexActionsContextMenuButton');
    expect(button.length).toEqual(1);
  });

  test('should update the Actions menu button text when more than one row is selected', async () => {
    const rendered = mountWithIntl(component);
    await runAllPromises();
    rendered.update();

    let button = findTestSubject(rendered, 'indexActionsContextMenuButton');
    expect(button.length).toEqual(0);

    const checkboxes = findTestSubject(rendered, 'indexTableRowCheckbox');
    checkboxes.at(0).simulate('change', { target: { checked: true } });
    rendered.update();
    button = findTestSubject(rendered, 'indexActionsContextMenuButton');
    expect(button.text()).toEqual('Manage index');

    checkboxes.at(1).simulate('change', { target: { checked: true } });
    rendered.update();
    button = findTestSubject(rendered, 'indexActionsContextMenuButton');
    expect(button.text()).toEqual('Manage 2 indices');
  });

  test('should show hidden indices only when the switch is turned on', async () => {
    const rendered = mountWithIntl(component);
    await runAllPromises();
    rendered.update();

    // We have manually set `.admin1` and `.admin3` as hidden indices
    // We **don't** expect them to be in this list as by default we don't show hidden indices
    let indicesInTable = namesText(rendered);
    expect(indicesInTable).not.toContain('.admin1');
    expect(indicesInTable).not.toContain('.admin3');

    if (kibanaVersion.major >= 8) {
      // From 8.x indices starting with a period are treated as normal indices
      expect(indicesInTable).toContain('.admin0');
      expect(indicesInTable).toContain('.admin2');
    } else if (kibanaVersion.major < 8) {
      // In 7.x those are treated as system and are thus hidden
      expect(indicesInTable).not.toContain('.admin0');
      expect(indicesInTable).not.toContain('.admin2');
    }

    snapshot(indicesInTable);

    // Enable "Show hidden indices"
    const switchControl = findTestSubject(rendered, 'checkboxToggles-includeHiddenIndices');
    switchControl.simulate('click');

    // We do expect now the `.admin1` and `.admin3` indices to be in the list
    indicesInTable = namesText(rendered);
    expect(indicesInTable).toContain('.admin1');
    expect(indicesInTable).toContain('.admin3');

    if (kibanaVersion.major < 8) {
      expect(indicesInTable).toContain('.admin0');
      expect(indicesInTable).toContain('.admin2');
    }

    snapshot(indicesInTable);
  });

  test('should filter based on content of search input', async () => {
    const rendered = mountWithIntl(component);
    await runAllPromises();
    rendered.update();

    const searchInput = rendered.find('input.euiFieldSearch').first();
    searchInput.instance().value = 'testy0';
    searchInput.simulate('keyup', { key: 'Enter', keyCode: 13, which: 13 });
    rendered.update();
    snapshot(namesText(rendered));
  });

  test('should sort when header is clicked', async () => {
    const rendered = mountWithIntl(component);
    await runAllPromises();
    rendered.update();

    const nameHeader = findTestSubject(rendered, 'indexTableHeaderCell-name').find('button');
    nameHeader.simulate('click');
    rendered.update();
    snapshot(namesText(rendered));

    nameHeader.simulate('click');
    rendered.update();
    snapshot(namesText(rendered));
  });

  test('should show the right context menu options when one index is selected and open', async () => {
    const rendered = mountWithIntl(component);
    await runAllPromises();
    rendered.update();

    const checkboxes = findTestSubject(rendered, 'indexTableRowCheckbox');
    checkboxes.at(0).simulate('change', { target: { checked: true } });
    rendered.update();
    const actionButton = findTestSubject(rendered, 'indexActionsContextMenuButton');
    actionButton.simulate('click');
    rendered.update();
    snapshot(getActionMenuButtons(rendered));
  });

  test('should show the right context menu options when one index is selected and closed', async () => {
    const rendered = mountWithIntl(component);
    await runAllPromises();
    rendered.update();

    const checkboxes = findTestSubject(rendered, 'indexTableRowCheckbox');
    checkboxes.at(1).simulate('change', { target: { checked: true } });
    rendered.update();
    const actionButton = findTestSubject(rendered, 'indexActionsContextMenuButton');
    actionButton.simulate('click');
    rendered.update();
    snapshot(getActionMenuButtons(rendered));
  });

  test('should show the right context menu options when one open and one closed index is selected', async () => {
    const rendered = mountWithIntl(component);
    await runAllPromises();
    rendered.update();

    const checkboxes = findTestSubject(rendered, 'indexTableRowCheckbox');
    checkboxes.at(0).simulate('change', { target: { checked: true } });
    checkboxes.at(1).simulate('change', { target: { checked: true } });
    rendered.update();
    const actionButton = findTestSubject(rendered, 'indexActionsContextMenuButton');
    actionButton.simulate('click');
    rendered.update();
    snapshot(getActionMenuButtons(rendered));
  });

  test('should show the right context menu options when more than one open index is selected', async () => {
    const rendered = mountWithIntl(component);
    await runAllPromises();
    rendered.update();

    const checkboxes = findTestSubject(rendered, 'indexTableRowCheckbox');
    checkboxes.at(0).simulate('change', { target: { checked: true } });
    checkboxes.at(2).simulate('change', { target: { checked: true } });
    rendered.update();
    const actionButton = findTestSubject(rendered, 'indexActionsContextMenuButton');
    actionButton.simulate('click');
    rendered.update();
    snapshot(getActionMenuButtons(rendered));
  });

  test('should show the right context menu options when more than one closed index is selected', async () => {
    const rendered = mountWithIntl(component);
    await runAllPromises();
    rendered.update();

    const checkboxes = findTestSubject(rendered, 'indexTableRowCheckbox');
    checkboxes.at(1).simulate('change', { target: { checked: true } });
    checkboxes.at(3).simulate('change', { target: { checked: true } });
    rendered.update();
    const actionButton = findTestSubject(rendered, 'indexActionsContextMenuButton');
    actionButton.simulate('click');
    rendered.update();
    snapshot(getActionMenuButtons(rendered));
  });

  test('flush button works from context menu', async () => {
    const rendered = mountWithIntl(component);
    await runAllPromises();
    rendered.update();
    testAction(rendered, 'flushIndexMenuButton');
  });

  test('clear cache button works from context menu', async () => {
    const rendered = mountWithIntl(component);
    await runAllPromises();
    rendered.update();
    testAction(rendered, 'clearCacheIndexMenuButton');
  });

  test('refresh button works from context menu', async () => {
    const rendered = mountWithIntl(component);
    await runAllPromises();
    rendered.update();
    testAction(rendered, 'refreshIndexMenuButton');
  });

  test('force merge button works from context menu', async () => {
    const rendered = mountWithIntl(component);
    await runAllPromises();
    rendered.update();

    const rowIndex = 0;
    openMenuAndClickButton(rendered, rowIndex, 'forcemergeIndexMenuButton');
    snapshot(status(rendered, rowIndex));
    expect(rendered.find('div.euiModal').length).toBe(1);

    let count = 0;
    store.subscribe(() => {
      if (count === 1) {
        snapshot(status(rendered, rowIndex));
        expect(rendered.find('div.euiModal').length).toBe(0);
      }
      count++;
    });

    const confirmButton = findTestSubject(rendered, 'confirmModalConfirmButton');
    confirmButton.simulate('click');
    snapshot(status(rendered, rowIndex));
  });

  test('close index button works from context menu', async () => {
    const modifiedIndices = indices.map((index) => {
      return {
        ...index,
        status: index.name === 'testy0' ? 'close' : index.status,
      };
    });
    httpRequestsMockHelpers.setReloadIndicesResponse(modifiedIndices);

    const rendered = mountWithIntl(component);
    await runAllPromises();
    rendered.update();

    testAction(rendered, 'closeIndexMenuButton');
  });

  test('open index button works from context menu', async () => {
    const modifiedIndices = indices.map((index) => {
      return {
        ...index,
        status: index.name === 'testy1' ? 'closed' : index.status,
      };
    });
    httpRequestsMockHelpers.setLoadIndicesResponse(modifiedIndices);

    const rendered = mountWithIntl(component);
    await runAllPromises();
    rendered.update();

    testAction(rendered, 'openIndexMenuButton', 'testy1');
  });

  describe('Common index actions', () => {
    beforeEach(() => {
      // Mock initialization of services; set enableIndexActions=false to verify config behavior
      setupMockComponent({ config: { enableIndexActions: false, enableLegacyTemplates: true } });
    });

    test('Common index actions should be hidden when feature is turned off', async () => {
      const rendered = mountWithIntl(component);
      await runAllPromises();
      rendered.update();

      expect(findTestSubject(rendered, 'showStatsIndexMenuButton').length).toBe(0);
      expect(findTestSubject(rendered, 'closeIndexMenuButton').length).toBe(0);
      expect(findTestSubject(rendered, 'forcemergeIndexMenuButton').length).toBe(0);
      expect(findTestSubject(rendered, 'refreshIndexMenuButton').length).toBe(0);
      expect(findTestSubject(rendered, 'clearCacheIndexMenuButton').length).toBe(0);
      expect(findTestSubject(rendered, 'flushIndexMenuButton').length).toBe(0);
    });
  });
});
