// Package server exposes graph2agent through the Model Context Protocol.
package server

import (
	"context"
	"encoding/json"
	"fmt"

	graph2agent "github.com/graph2agent/graph2agent"
	"github.com/graph2agent/graph2agent/pkg/mermaid"
	"github.com/graph2agent/graph2agent/pkg/narrative"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const (
	// ToolName is the stable MCP name for the Mermaid description tool.
	ToolName = "describe_mermaid"

	defaultProfile  = narrative.ProfileStandard
	inputSchemaJSON = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["mermaid"],
  "properties": {
    "mermaid": {
      "type": "string",
      "description": "Mermaid source to compile in strict mode (maximum 4 MiB as UTF-8 bytes)."
    },
    "profile": {
      "type": "string",
      "description": "Deterministic graph2agent narrative profile.",
      "default": "standard",
      "enum": [
        "compact",
        "standard",
        "exhaustive",
        "readable-v1",
        "interpreted-v1",
        "interpreted-v2",
        "interpreted-v3"
      ]
    }
  }
}`
)

// Version is replaced by release builds through -ldflags.
var Version = "dev"

// DescribeInput is the input contract for describe_mermaid.
type DescribeInput struct {
	Mermaid string `json:"mermaid"`
	Profile string `json:"profile,omitempty"`
}

// Diagnostic is a stable, transport-oriented representation of a compiler
// diagnostic.
type Diagnostic struct {
	Severity string `json:"severity" jsonschema:"diagnostic severity"`
	Code     string `json:"code" jsonschema:"stable diagnostic code"`
	Line     int    `json:"line,omitempty" jsonschema:"one-based source line, when available"`
	Message  string `json:"message" jsonschema:"human-readable diagnostic message"`
	Source   string `json:"source,omitempty" jsonschema:"source excerpt, when available"`
}

// DescribeOutput is the structured result returned alongside the rendered
// narrative text.
type DescribeOutput struct {
	Text                 string       `json:"text" jsonschema:"deterministic graph2agent narrative"`
	DiagramKind          string       `json:"diagram_kind" jsonschema:"recognized Mermaid diagram family"`
	SourceSHA256         string       `json:"source_sha256" jsonschema:"SHA-256 of the exact Mermaid input bytes"`
	SemanticSHA256       string       `json:"semantic_sha256" jsonschema:"SHA-256 of canonical diagram semantics"`
	Graph2AgentVersion   string       `json:"graph2agent_version" jsonschema:"graph2agent compiler version"`
	CompatibilityProfile string       `json:"compatibility_profile" jsonschema:"fixed graph2agent semantic compatibility contract"`
	IRSchemaVersion      string       `json:"ir_schema_version" jsonschema:"canonical diagram IR schema version"`
	NarrativeProfile     string       `json:"narrative_profile" jsonschema:"narrative profile used for this result"`
	ParseMode            string       `json:"parse_mode" jsonschema:"fixed Mermaid parser mode"`
	Diagnostics          []Diagnostic `json:"diagnostics" jsonschema:"compiler diagnostics in deterministic order"`
}

// New constructs a server with the complete, immutable MCP surface.
func New() *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{
		Name:        "graph2agent-mcp",
		Title:       "graph2agent MCP",
		Description: "Deterministic, strict Mermaid-to-narrative compiler for agents.",
		Version:     Version,
		WebsiteURL:  "https://github.com/graph2agent/mcp",
	}, &mcp.ServerOptions{
		Instructions: "Use describe_mermaid to turn supported Mermaid source into deterministic text and compiler metadata. Input is always parsed strictly under core-contract-v2.",
		Capabilities: &mcp.ServerCapabilities{
			Tools: &mcp.ToolCapabilities{},
		},
	})

	falseValue := false
	mcp.AddTool(server, &mcp.Tool{
		Name:        ToolName,
		Title:       "Describe Mermaid",
		Description: "Compile a supported Mermaid diagram in strict mode and return deterministic agent-readable text plus hashes and contract metadata. Supports flowchart, sequence, class, state, and ER diagrams.",
		InputSchema: json.RawMessage(inputSchemaJSON),
		Annotations: &mcp.ToolAnnotations{
			Title:           "Describe Mermaid",
			ReadOnlyHint:    true,
			IdempotentHint:  true,
			DestructiveHint: &falseValue,
			OpenWorldHint:   &falseValue,
		},
	}, describeMermaid)

	return server
}

func describeMermaid(ctx context.Context, _ *mcp.CallToolRequest, input DescribeInput) (*mcp.CallToolResult, DescribeOutput, error) {
	profile, err := narrativeProfile(input.Profile)
	if err != nil {
		return nil, DescribeOutput{}, err
	}

	compiled, err := graph2agent.Compile(ctx, []byte(input.Mermaid), graph2agent.Options{
		Mode:          graph2agent.ParseStrict,
		Profile:       profile,
		Compatibility: graph2agent.CompatibilityProfileV2,
		MaxInputBytes: graph2agent.DefaultMaxInputBytes,
		MaxStatements: mermaid.DefaultMaxStatements,
		MaxObjects:    graph2agent.DefaultMaxObjects,
	})
	if err != nil {
		return nil, DescribeOutput{}, fmt.Errorf("compile Mermaid: %w", err)
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

	output := DescribeOutput{
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

	return &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: output.Text}},
	}, output, nil
}

func narrativeProfile(value string) (narrative.Profile, error) {
	if value == "" {
		return defaultProfile, nil
	}

	profile := narrative.Profile(value)
	switch profile {
	case narrative.ProfileCompact,
		narrative.ProfileStandard,
		narrative.ProfileExhaustive,
		narrative.ProfileReadableV1,
		narrative.ProfileInterpretedV1,
		narrative.ProfileInterpretedV2,
		narrative.ProfileInterpretedV3:
		return profile, nil
	default:
		return "", fmt.Errorf("unsupported narrative profile %q", value)
	}
}
