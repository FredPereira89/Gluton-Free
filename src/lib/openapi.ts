import { z } from "zod";
import { acceptedJobSchema, paginatedSchema, paginationQuerySchema, routes } from "./api-contract";
import { problemSchema } from "./problem";

type JsonSchema = Record<string, unknown>;

function jsonSchema(schema: z.ZodType): JsonSchema {
  const { $schema: _dialect, ...body } = z.toJSONSchema(schema, { target: "draft-2020-12", reused: "inline" });
  return body;
}

function parameters(schema: z.ZodObject, location: "path" | "query") {
  const object = jsonSchema(schema);
  const properties = object.properties as Record<string, JsonSchema>;
  const required = new Set((object.required as string[] | undefined) ?? []);
  return Object.entries(properties).map(([name, value]) => ({
    name,
    in: location,
    required: location === "path" || required.has(name),
    schema: value,
  }));
}

export function createOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [operationId, route] of Object.entries(routes)) {
    const request = route.request as { params?: z.ZodObject; query?: z.ZodObject; body?: z.ZodType };
    const operation: Record<string, unknown> = {
      operationId,
      responses: Object.fromEntries(
        Object.entries(route.responses).map(([status, schema]) => [
          status,
          {
            description: status === "200" ? "Success" : "Problem",
            content: {
              [status === "200" ? "application/json" : "application/problem+json"]: {
                schema: schema === problemSchema ? { $ref: "#/components/schemas/Problem" } : jsonSchema(schema),
              },
            },
          },
        ]),
      ),
    };
    const routeParameters = [
      ...(request.params ? parameters(request.params, "path") : []),
      ...(request.query ? parameters(request.query, "query") : []),
    ];
    if (routeParameters.length) operation.parameters = routeParameters;
    if (request.body) operation.requestBody = {
      required: true,
      content: { "application/json": { schema: jsonSchema(request.body) } },
    };
    if (route.auth === "owner") {
      operation.security = [{ ownerBearer: [] }, { ownerSession: [] }];
    }
    (paths[route.path] ??= {})[route.method.toLowerCase()] = operation;
  }

  return {
    openapi: "3.1.0",
    info: { title: "Gluton-Free API", version: "1.0.0" },
    paths,
    components: {
      securitySchemes: {
        ownerBearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        ownerSession: { type: "apiKey", in: "header", name: "Cookie", description: "Owner's project-specific Supabase web session cookies" },
      },
      schemas: {
        Problem: jsonSchema(problemSchema),
        AcceptedJob: jsonSchema(acceptedJobSchema),
        PaginationQuery: jsonSchema(paginationQuerySchema),
        PaginatedItems: jsonSchema(paginatedSchema(z.unknown())),
      },
    },
  };
}

export const openApiDocument = createOpenApiDocument();
