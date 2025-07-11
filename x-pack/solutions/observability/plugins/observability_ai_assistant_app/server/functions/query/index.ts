/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolDefinition, isChatCompletionChunkEvent, isOutputEvent } from '@kbn/inference-common';
import { correctCommonEsqlMistakes } from '@kbn/inference-plugin/common';
import { naturalLanguageToEsql } from '@kbn/inference-plugin/server';
import {
  MessageAddEvent,
  MessageRole,
  StreamingChatResponseEventType,
} from '@kbn/observability-ai-assistant-plugin/common';
import { createFunctionResponseMessage } from '@kbn/observability-ai-assistant-plugin/common/utils/create_function_response_message';
import { convertMessagesForInference } from '@kbn/observability-ai-assistant-plugin/common/convert_messages_for_inference';
import { map } from 'rxjs';
import { v4 } from 'uuid';
import { VISUALIZE_QUERY_NAME } from '../../../common/functions/visualize_esql';
import type { FunctionRegistrationParameters } from '..';
import { runAndValidateEsqlQuery } from './validate_esql_query';

export const QUERY_FUNCTION_NAME = 'query';
export const EXECUTE_QUERY_NAME = 'execute_query';

export function registerQueryFunction({
  functions,
  resources,
  pluginsStart,
  signal,
}: FunctionRegistrationParameters) {
  functions.registerInstruction(({ availableFunctionNames }) => {
    if (!availableFunctionNames.includes(QUERY_FUNCTION_NAME)) {
      return;
    }

    return `You MUST use the "${QUERY_FUNCTION_NAME}" function when the user wants to:
  - visualize data
  - run any arbitrary query
  - breakdown or filter ES|QL queries that are displayed on the current page
  - convert queries from another language to ES|QL
  - asks general questions about ES|QL

  DO NOT UNDER ANY CIRCUMSTANCES generate ES|QL queries or explain anything about the ES|QL query language yourself.
  DO NOT UNDER ANY CIRCUMSTANCES try to correct an ES|QL query yourself - always use the "${QUERY_FUNCTION_NAME}" function for this.

  If the user asks for a query, and one of the dataset info functions was called and returned no results, you should still call the query function to generate an example query.

  Even if the "${QUERY_FUNCTION_NAME}" function was used before that, follow it up with the "${QUERY_FUNCTION_NAME}" function. If a query fails, do not attempt to correct it yourself. Again you should call the "${QUERY_FUNCTION_NAME}" function,
  even if it has been called before.`;
  });

  functions.registerFunction(
    {
      name: EXECUTE_QUERY_NAME,
      isInternal: true,
      description: `Execute a generated ES|QL query on behalf of the user. The results
        will be returned to you.

        You must use this function if the user is asking for the result of a query,
        such as a metric or list of things, but does not want to visualize it in
        a table or chart. You do NOT need to ask permission to execute the query
        after generating it, use the "${EXECUTE_QUERY_NAME}" function directly instead.

        Do not use when the user just asks for an example.`,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
          },
        },
        required: ['query'],
      } as const,
    },
    async ({ arguments: { query } }) => {
      const correctedQuery = correctCommonEsqlMistakes(query).output;

      const client = (await resources.context.core).elasticsearch.client.asCurrentUser;
      const { error, errorMessages, rows, columns } = await runAndValidateEsqlQuery({
        query: correctedQuery,
        client,
        signal,
      });

      if (!!error) {
        return {
          content: {
            message: 'The query failed to execute',
            error,
            errorMessages,
          },
        };
      }

      return {
        content: {
          columns,
          rows,
        },
      };
    }
  );

  functions.registerFunction(
    {
      name: QUERY_FUNCTION_NAME,
      description: `This function generates, executes and/or visualizes a query
      based on the user's request. It also explains how ES|QL works and how to
      convert queries from one language to another. Make sure you call one of
      the get_dataset functions first if you need index or field names. This
      function takes no input.`,
    },
    async ({ messages, connectorId, simulateFunctionCalling }) => {
      const esqlFunctions = functions
        .getFunctions()
        .filter(
          (fn) =>
            fn.definition.name === EXECUTE_QUERY_NAME || fn.definition.name === VISUALIZE_QUERY_NAME
        )
        .map((fn) => fn.definition);

      const actions = functions.getActions();

      const inferenceMessages = convertMessagesForInference(
        // remove system message and query function request
        messages.filter((message) => message.message.role !== MessageRole.System).slice(0, -1),
        resources.logger
      );

      const events$ = naturalLanguageToEsql({
        client: pluginsStart.inference.getClient({ request: resources.request }),
        connectorId,
        messages: inferenceMessages,
        logger: resources.logger,
        tools: Object.fromEntries(
          [...actions, ...esqlFunctions].map((fn) => [
            fn.name,
            { description: fn.description, schema: fn.parameters } as ToolDefinition,
          ])
        ),
        functionCalling: simulateFunctionCalling ? 'simulated' : 'auto',
        maxRetries: 0,
        metadata: {
          connectorTelemetry: {
            pluginId: 'observability_ai_assistant',
          },
        },
      });

      const chatMessageId = v4();

      return events$.pipe(
        map((event) => {
          if (isOutputEvent(event)) {
            return createFunctionResponseMessage({
              content: {},
              name: QUERY_FUNCTION_NAME,
              data: event.output,
            });
          }
          if (isChatCompletionChunkEvent(event)) {
            return {
              id: chatMessageId,
              type: StreamingChatResponseEventType.ChatCompletionChunk,
              message: {
                content: event.content,
              },
            };
          }

          const fnCall = event.toolCalls[0]
            ? {
                name: event.toolCalls[0].function.name,
                arguments: JSON.stringify(event.toolCalls[0].function.arguments),
                trigger: MessageRole.Assistant as const,
              }
            : undefined;

          const messageAddEvent: MessageAddEvent = {
            type: StreamingChatResponseEventType.MessageAdd,
            id: chatMessageId,
            message: {
              '@timestamp': new Date().toISOString(),
              message: {
                content: event.content,
                role: MessageRole.Assistant,
                function_call: fnCall,
              },
            },
          };

          return messageAddEvent;
        })
      );
    }
  );
}
