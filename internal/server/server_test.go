package server

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"slices"
	"strings"
	"testing"

	graph2agent "github.com/graph2agent/graph2agent"
	"github.com/graph2agent/graph2agent/pkg/mermaid"
	"github.com/graph2agent/graph2agent/pkg/narrative"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestSourceVersionMatchesCompilerVersion(t *testing.T) {
	if Version != graph2agent.Version {
		t.Fatalf("source MCP version %q does not match graph2agent compiler version %q", Version, graph2agent.Version)
	}
}

func TestListToolsAdvertisesSingleStrictReadOnlyTool(t *testing.T) {
	client := connectTestClient(t)
	initialized := client.InitializeResult()
	if initialized == nil || initialized.ServerInfo == nil {
		t.Fatal("client did not retain server initialization metadata")
	}
	if initialized.ServerInfo.Name != "graph2agent-mcp" || initialized.ServerInfo.Version != Version {
		t.Fatalf("server info = %#v, want graph2agent-mcp version %q", initialized.ServerInfo, Version)
	}
	if initialized.Capabilities == nil || initialized.Capabilities.Tools == nil {
		t.Fatalf("server capabilities do not advertise tools: %#v", initialized.Capabilities)
	}
	if initialized.Capabilities.Tools.ListChanged {
		t.Fatal("server advertises tool-list changes despite an immutable tool surface")
	}
	if initialized.Capabilities.Logging != nil {
		t.Fatalf("server unexpectedly advertises logging: %#v", initialized.Capabilities.Logging)
	}

	listed, err := client.ListTools(t.Context(), nil)
	if err != nil {
		t.Fatalf("ListTools: %v", err)
	}
	if len(listed.Tools) != 1 {
		t.Fatalf("listed %d tools, want exactly one", len(listed.Tools))
	}

	tool := listed.Tools[0]
	if tool.Name != ToolName {
		t.Fatalf("tool name = %q, want %q", tool.Name, ToolName)
	}
	if tool.Description == "" || !strings.Contains(tool.Description, "strict mode") {
		t.Fatalf("tool description does not state strict behavior: %q", tool.Description)
	}
	if tool.Annotations == nil {
		t.Fatal("tool annotations are missing")
	}
	annotations := tool.Annotations
	if !annotations.ReadOnlyHint || !annotations.IdempotentHint {
		t.Fatalf("tool annotations = %#v, want read-only and idempotent", annotations)
	}
	if annotations.DestructiveHint == nil || *annotations.DestructiveHint {
		t.Fatalf("destructive hint = %#v, want explicit false", annotations.DestructiveHint)
	}
	if annotations.OpenWorldHint == nil || *annotations.OpenWorldHint {
		t.Fatalf("open-world hint = %#v, want explicit false", annotations.OpenWorldHint)
	}

	var input struct {
		Type                 string `json:"type"`
		AdditionalProperties bool   `json:"additionalProperties"`
		Required             []string
		Properties           map[string]struct {
			Type    string   `json:"type"`
			Default string   `json:"default"`
			Enum    []string `json:"enum"`
		} `json:"properties"`
	}
	remarshal(t, tool.InputSchema, &input)
	if input.Type != "object" || input.AdditionalProperties {
		t.Fatalf("input schema root = type %q, additionalProperties %t", input.Type, input.AdditionalProperties)
	}
	if !reflect.DeepEqual(input.Required, []string{"mermaid"}) {
		t.Fatalf("required inputs = %v, want [mermaid]", input.Required)
	}
	if input.Properties["mermaid"].Type != "string" {
		t.Fatalf("mermaid schema = %#v", input.Properties["mermaid"])
	}
	profile := input.Properties["profile"]
	if profile.Type != "string" || profile.Default != "standard" {
		t.Fatalf("profile schema = %#v, want string with standard default", profile)
	}
	wantProfiles := []string{
		"compact",
		"standard",
		"exhaustive",
		"readable-v1",
		"interpreted-v1",
		"interpreted-v2",
		"interpreted-v3",
	}
	if !reflect.DeepEqual(profile.Enum, wantProfiles) {
		t.Fatalf("profile enum = %v, want %v", profile.Enum, wantProfiles)
	}

	var output struct {
		Type                 string                     `json:"type"`
		AdditionalProperties bool                       `json:"additionalProperties"`
		Required             []string                   `json:"required"`
		Properties           map[string]json.RawMessage `json:"properties"`
	}
	remarshal(t, tool.OutputSchema, &output)
	if output.Type != "object" || output.AdditionalProperties {
		t.Fatalf("output schema root = type %q, additionalProperties %t", output.Type, output.AdditionalProperties)
	}
	wantOutputFields := []string{
		"compatibility_profile",
		"diagnostics",
		"diagram_kind",
		"graph2agent_version",
		"ir_schema_version",
		"narrative_profile",
		"parse_mode",
		"semantic_sha256",
		"source_sha256",
		"text",
	}
	slices.Sort(output.Required)
	if !reflect.DeepEqual(output.Required, wantOutputFields) {
		t.Fatalf("required output fields = %v, want %v", output.Required, wantOutputFields)
	}
	for _, field := range wantOutputFields {
		if _, ok := output.Properties[field]; !ok {
			t.Errorf("output schema is missing property %q", field)
		}
	}
}

func TestDescribeMermaidProtocolParityAcrossFamilies(t *testing.T) {
	client := connectTestClient(t)
	tests := []struct {
		name   string
		kind   string
		source string
	}{
		{
			name: "flowchart",
			kind: "flowchart",
			source: `---
title: Request routing
---
flowchart TD
  subgraph runtime[Runtime]
    client[Client] -->|HTTPS| api(API)
    api -- accepted --> worker[Worker]
    api --> rejected[Reject]
  end
`,
		},
		{
			name: "sequence",
			kind: "sequence",
			source: `sequenceDiagram
participant C as Client
participant S as Service
C->>S: request
S-->>C: response
`,
		},
		{
			name: "class",
			kind: "class",
			source: `classDiagram
class Animal
class Dog
Dog --|> Animal : is a
Owner o-- Dog : owns
`,
		},
		{
			name: "state",
			kind: "state",
			source: `stateDiagram-v2
[*] --> Idle
Idle --> Active : start
Active --> [*] : stop
`,
		},
		{
			name: "er",
			kind: "er",
			source: `erDiagram
CUSTOMER {
  string id PK
}
ORDER {
  string id PK
}
CUSTOMER ||--o{ ORDER : places
`,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result := callDescribe(t, client, map[string]any{
				"mermaid": test.source,
				"profile": "standard",
			})
			if result.IsError {
				t.Fatalf("CallTool returned a tool error: %s", toolText(t, result))
			}

			got := decodeOutput(t, result)
			want := directOutput(t, test.source, narrative.ProfileStandard)
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("protocol output differs from direct compiler\ngot:  %#v\nwant: %#v", got, want)
			}
			if got.DiagramKind != test.kind {
				t.Fatalf("diagram kind = %q, want %q", got.DiagramKind, test.kind)
			}
			if text := toolText(t, result); text != got.Text {
				t.Fatalf("text content differs from structured text\ncontent: %q\nstructured: %q", text, got.Text)
			}
		})
	}
}

func TestDescribeMermaidProfilesAndDefaultMatchDirectCompiler(t *testing.T) {
	client := connectTestClient(t)
	const source = `flowchart LR
Start[Start] --> Decision{Ready?}
Decision -->|yes| Done[Done]
Decision -->|no| Retry[Retry]
Retry --> Decision
`
	profiles := []narrative.Profile{
		narrative.ProfileCompact,
		narrative.ProfileStandard,
		narrative.ProfileExhaustive,
		narrative.ProfileReadableV1,
		narrative.ProfileInterpretedV1,
		narrative.ProfileInterpretedV2,
		narrative.ProfileInterpretedV3,
	}

	for _, profile := range profiles {
		t.Run(string(profile), func(t *testing.T) {
			result := callDescribe(t, client, map[string]any{
				"mermaid": source,
				"profile": string(profile),
			})
			if result.IsError {
				t.Fatalf("CallTool returned a tool error: %s", toolText(t, result))
			}
			got := decodeOutput(t, result)
			want := directOutput(t, source, profile)
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("profile output differs from direct compiler\ngot:  %#v\nwant: %#v", got, want)
			}
		})
	}

	withoutProfile := callDescribe(t, client, map[string]any{"mermaid": source})
	withStandard := callDescribe(t, client, map[string]any{"mermaid": source, "profile": "standard"})
	if withoutProfile.IsError || withStandard.IsError {
		t.Fatalf("default/standard calls failed: default=%q standard=%q", toolText(t, withoutProfile), toolText(t, withStandard))
	}
	if got, want := decodeOutput(t, withoutProfile), decodeOutput(t, withStandard); !reflect.DeepEqual(got, want) {
		t.Fatalf("omitted profile does not default to standard\ndefault:  %#v\nstandard: %#v", got, want)
	}
}

func TestDescribeMermaidIsDeterministicAcrossRepeatedCalls(t *testing.T) {
	client := connectTestClient(t)
	arguments := map[string]any{
		"mermaid": "flowchart LR\nA[Client] --> B[API]\n",
		"profile": "standard",
	}

	first := callDescribe(t, client, arguments)
	second := callDescribe(t, client, arguments)
	if first.IsError || second.IsError {
		t.Fatalf("repeated calls failed: first=%q second=%q", toolText(t, first), toolText(t, second))
	}
	if got, want := decodeOutput(t, second), decodeOutput(t, first); !reflect.DeepEqual(got, want) {
		t.Fatalf("repeated call changed output\nfirst:  %#v\nsecond: %#v", want, got)
	}
}

func TestDescribeMermaidProtocolErrors(t *testing.T) {
	client := connectTestClient(t)
	tests := []struct {
		name         string
		arguments    map[string]any
		wantContains []string
	}{
		{
			name:         "missing required mermaid",
			arguments:    map[string]any{},
			wantContains: []string{"mermaid", "required"},
		},
		{
			name: "unknown profile",
			arguments: map[string]any{
				"mermaid": "flowchart LR\nA --> B\n",
				"profile": "invented",
			},
			wantContains: []string{"profile", "invented"},
		},
		{
			name: "additional property",
			arguments: map[string]any{
				"mermaid": "flowchart LR\nA --> B\n",
				"unknown": true,
			},
			wantContains: []string{"unknown", "additional"},
		},
		{
			name: "strict syntax error",
			arguments: map[string]any{
				"mermaid": "flowchart LR\nA --> B\nnonsense ???\n",
			},
			wantContains: []string{"compile Mermaid", "unsupported_flow_statement"},
		},
		{
			name: "unsupported family",
			arguments: map[string]any{
				"mermaid": "pie\n  title Pets\n  \"Dogs\" : 1\n",
			},
			wantContains: []string{"compile Mermaid", "unsupported_diagram"},
		},
		{
			name: "input byte limit",
			arguments: map[string]any{
				"mermaid": strings.Repeat("x", graph2agent.DefaultMaxInputBytes+1),
			},
			wantContains: []string{"compile Mermaid", "limit is 4194304"},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result := callDescribe(t, client, test.arguments)
			if !result.IsError {
				t.Fatalf("CallTool succeeded unexpectedly: %#v", decodeOutput(t, result))
			}
			if result.StructuredContent != nil {
				t.Fatalf("tool error included structured content: %#v", result.StructuredContent)
			}
			text := toolText(t, result)
			for _, substring := range test.wantContains {
				if !strings.Contains(text, substring) {
					t.Errorf("tool error %q does not contain %q", text, substring)
				}
			}
		})
	}
}

func TestDescribeMermaidPropagatesCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, _, err := describeMermaid(ctx, nil, DescribeInput{
		Mermaid: "flowchart LR\nA --> B\n",
		Profile: "standard",
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("describeMermaid error = %v, want context.Canceled", err)
	}
}

func connectTestClient(t *testing.T) *mcp.ClientSession {
	t.Helper()

	clientTransport, serverTransport := mcp.NewInMemoryTransports()
	serverSession, err := New().Connect(t.Context(), serverTransport, nil)
	if err != nil {
		t.Fatalf("connect server: %v", err)
	}
	client := mcp.NewClient(&mcp.Implementation{
		Name:    "graph2agent-mcp-test",
		Version: "test",
	}, nil)
	clientSession, err := client.Connect(t.Context(), clientTransport, nil)
	if err != nil {
		_ = serverSession.Close()
		t.Fatalf("connect client: %v", err)
	}

	t.Cleanup(func() {
		_ = clientSession.Close()
		_ = serverSession.Close()
	})
	return clientSession
}

func callDescribe(t *testing.T, client *mcp.ClientSession, arguments map[string]any) *mcp.CallToolResult {
	t.Helper()
	result, err := client.CallTool(t.Context(), &mcp.CallToolParams{
		Name:      ToolName,
		Arguments: arguments,
	})
	if err != nil {
		t.Fatalf("CallTool: %v", err)
	}
	return result
}

func decodeOutput(t *testing.T, result *mcp.CallToolResult) DescribeOutput {
	t.Helper()
	if result.StructuredContent == nil {
		t.Fatal("CallTool result has no structured content")
	}
	var output DescribeOutput
	remarshal(t, result.StructuredContent, &output)
	return output
}

func directOutput(t *testing.T, source string, profile narrative.Profile) DescribeOutput {
	t.Helper()
	compiled, err := graph2agent.Compile(t.Context(), []byte(source), graph2agent.Options{
		Mode:          graph2agent.ParseStrict,
		Profile:       profile,
		Compatibility: graph2agent.CompatibilityProfileV2,
		MaxInputBytes: graph2agent.DefaultMaxInputBytes,
		MaxStatements: mermaid.DefaultMaxStatements,
		MaxObjects:    graph2agent.DefaultMaxObjects,
	})
	if err != nil {
		t.Fatalf("direct graph2agent Compile: %v", err)
	}

	diagnostics := make([]Diagnostic, len(compiled.Diagnostics))
	for index, diagnostic := range compiled.Diagnostics {
		diagnostics[index] = Diagnostic{
			Severity: string(diagnostic.Severity),
			Code:     diagnostic.Code,
			Line:     diagnostic.Line,
			Message:  diagnostic.Message,
			Source:   diagnostic.Source,
		}
	}
	return DescribeOutput{
		Text:                 compiled.Text,
		DiagramKind:          string(compiled.Diagram.Kind),
		SourceSHA256:         compiled.SourceSHA256,
		SemanticSHA256:       compiled.SemanticSHA256,
		Graph2AgentVersion:   graph2agent.Version,
		CompatibilityProfile: compiled.Compatibility,
		IRSchemaVersion:      compiled.Diagram.SchemaVersion,
		NarrativeProfile:     string(profile),
		ParseMode:            string(graph2agent.ParseStrict),
		Diagnostics:          diagnostics,
	}
}

func toolText(t *testing.T, result *mcp.CallToolResult) string {
	t.Helper()
	if len(result.Content) != 1 {
		t.Fatalf("content block count = %d, want 1", len(result.Content))
	}
	text, ok := result.Content[0].(*mcp.TextContent)
	if !ok {
		t.Fatalf("content type = %T, want *mcp.TextContent", result.Content[0])
	}
	return text.Text
}

func remarshal(t *testing.T, source any, destination any) {
	t.Helper()
	encoded, err := json.Marshal(source)
	if err != nil {
		t.Fatalf("marshal %T: %v", source, err)
	}
	if err := json.Unmarshal(encoded, destination); err != nil {
		t.Fatalf("unmarshal %T into %T: %v", source, destination, err)
	}
}
