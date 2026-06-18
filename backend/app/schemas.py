from pydantic import BaseModel, Field


class FailureCard(BaseModel):
    """The atomic unit of the museum: one structured failure lesson."""

    id: str = ""
    title: str = ""
    one_line: str = ""
    scenario: str = ""
    tags: list[str] = Field(default_factory=list)
    tech_domains: list[str] = Field(default_factory=list)
    severity: str = ""
    happened_at: str = ""
    context: str = ""
    what_happened: str = ""
    root_cause: str = ""
    impact: str = ""
    warning_signals: list[str] = Field(default_factory=list)
    checklist: list[str] = Field(default_factory=list)
    resolution: str = ""
    anonymized: bool = True
    owner_team: str = ""
    source_type: str = ""


class IngestRequest(BaseModel):
    raw_text: str
    source_type: str = "pasted-text"


class SearchRequest(BaseModel):
    query: str
    top_k: int = 8


class SearchHit(BaseModel):
    card: FailureCard
    score: float


class RiskCheckRequest(BaseModel):
    requirement: str
    context: str = ""
    top_k: int = 5


class MatchedFailure(BaseModel):
    id: str
    title: str
    similarity: float = 0.0
    why_relevant: str = ""


class RiskAlert(BaseModel):
    risk: str
    from_card: str = ""
    from_title: str = ""
    severity: str = ""


class SystemicPattern(BaseModel):
    """A recurring failure pattern surfaced inside a risk report."""

    id: str = ""
    name: str = ""
    principle: str = ""
    systemic_risk: str = ""
    count: int = 0
    domains: list[str] = Field(default_factory=list)
    matched_card_ids: list[str] = Field(default_factory=list)


class RiskReport(BaseModel):
    requirement: str
    normalized: dict = Field(default_factory=dict)
    matched_failures: list[MatchedFailure] = Field(default_factory=list)
    risk_alerts: list[RiskAlert] = Field(default_factory=list)
    pre_launch_checklist: list[str] = Field(default_factory=list)
    questions_to_think: list[str] = Field(default_factory=list)
    systemic_patterns: list[SystemicPattern] = Field(default_factory=list)
    llm_used: bool = True


class Stats(BaseModel):
    total: int = 0
    by_scenario: dict = Field(default_factory=dict)
    by_severity: dict = Field(default_factory=dict)
    top_tags: list = Field(default_factory=list)


class GraphNode(BaseModel):
    id: str
    title: str = ""
    one_line: str = ""
    scenario: str = ""
    severity: str = ""
    tags: list[str] = Field(default_factory=list)
    tech_domains: list[str] = Field(default_factory=list)
    cluster: str = ""
    degree: int = 0


class GraphEdge(BaseModel):
    source: str
    target: str
    weight: float = 0.0
    shared: list[str] = Field(default_factory=list)


class FailurePattern(BaseModel):
    """A cluster of failures sharing the same underlying mechanism."""

    id: str = ""
    name: str = ""
    principle: str = ""
    systemic_risk: str = ""
    member_ids: list[str] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)
    scenarios: list[str] = Field(default_factory=list)
    count: int = 0
    severity_max: str = ""
    llm_used: bool = False


class GraphData(BaseModel):
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
    patterns: list[FailurePattern] = Field(default_factory=list)
    llm_used: bool = False


class CuratorMessage(BaseModel):
    role: str
    content: str


class CuratorChatRequest(BaseModel):
    messages: list[CuratorMessage] = Field(default_factory=list)


class CuratorChatResponse(BaseModel):
    answer: str = ""
    cited_card_ids: list[str] = Field(default_factory=list)
    tool_trace: list[str] = Field(default_factory=list)
    llm_used: bool = True
