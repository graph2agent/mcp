package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"

	"github.com/graph2agent/mcp/internal/server"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	if err := server.New().Run(ctx, &mcp.StdioTransport{}); err != nil && !errors.Is(err, context.Canceled) {
		fmt.Fprintf(os.Stderr, "graph2agent-mcp: %v\n", err)
		os.Exit(1)
	}
}
