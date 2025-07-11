/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../../common/ftr_provider_context';

import { postCaseReq, postCommentUserReq } from '../../../../common/lib/mock';
import {
  deleteAllCaseItems,
  createCase,
  createComment,
  getComment,
  getAuthWithSuperUser,
} from '../../../../common/lib/api';

export default ({ getService }: FtrProviderContext): void => {
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const es = getService('es');
  const authSpace1 = getAuthWithSuperUser();

  describe('get_comment', () => {
    afterEach(async () => {
      await deleteAllCaseItems(es);
    });

    it('should get a comment in space1', async () => {
      const postedCase = await createCase(supertestWithoutAuth, postCaseReq, 200, authSpace1);
      const patchedCase = await createComment({
        supertest: supertestWithoutAuth,
        caseId: postedCase.id,
        params: postCommentUserReq,
        auth: authSpace1,
      });
      const comment = await getComment({
        supertest: supertestWithoutAuth,
        caseId: postedCase.id,
        commentId: patchedCase.comments![0].id,
        auth: authSpace1,
      });

      expect(comment).to.eql(patchedCase.comments![0]);
    });

    it('should not get a comment in space2 when it was created in space1', async () => {
      const postedCase = await createCase(supertestWithoutAuth, postCaseReq, 200, authSpace1);
      const patchedCase = await createComment({
        supertest: supertestWithoutAuth,
        caseId: postedCase.id,
        params: postCommentUserReq,
        auth: authSpace1,
      });
      await getComment({
        supertest: supertestWithoutAuth,
        caseId: postedCase.id,
        commentId: patchedCase.comments![0].id,
        auth: getAuthWithSuperUser('space2'),
        expectedHttpCode: 404,
      });
    });
  });
};
