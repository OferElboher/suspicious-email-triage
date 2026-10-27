import { render, screen } from "@testing-library/react";
import LogSearchPanel from "./LogSearchPanel";

describe("LogSearchPanel", () => {
  it("explains plain-language log search and that it is not Elasticsearch", () => {
    render(<LogSearchPanel standalone />);
    expect(screen.getByText(/Plain-language search:/i)).toBeInTheDocument();
    expect(screen.getByText(/Elasticsearch/i)).toBeInTheDocument();
    expect(screen.getByText(/merged\.log/i)).toBeInTheDocument();
  });
});
