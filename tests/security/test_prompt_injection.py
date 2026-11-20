import os
import json
import pytest
from backend.services.tinyllama_service import TinyLlamaService
from backend.services.llm_processor import LLMProcessor
from backend.models.schemas import AnalysisResponse, NewsSourceSchema

FIXTURES_PATH = os.path.join(os.path.dirname(__file__), "..", "fixtures", "malicious_payloads.json")

with open(FIXTURES_PATH, "r", encoding="utf-8") as f:
    PROMPT_INJECTIONS = json.load(f)["prompt_injection_payloads"]

class TestPromptInjectionResilience:
    @pytest.fixture(scope="class")
    def tinyllama_service(self):
        return TinyLlamaService(quantization="4bit")

    @pytest.fixture(scope="class")
    def llm_processor(self):
        return LLMProcessor()

    @pytest.mark.parametrize("injection_text", PROMPT_INJECTIONS)
    def test_tinyllama_resilience_to_schema_corruption(self, tinyllama_service, injection_text):
        """
        Verifies that adversarial injections embedded in article text cannot break
        the required output schema of TinyLlama.
        """
        result = tinyllama_service.synthesize(
            article_a_title="Normal Headline A",
            article_a_text=f"Legitimate news text. {injection_text}",
            article_b_title="Normal Headline B",
            article_b_text=f"Counterpart coverage. {injection_text}",
            publisher_a="Source A",
            publisher_b="Source B",
        )

        # 1. Output must be a dictionary
        assert isinstance(result, dict)

        # 2. Schema compliance
        assert "topic" in result and isinstance(result["topic"], str)
        assert "consensus" in result and isinstance(result["consensus"], list)
        assert "left_out_by_a" in result and isinstance(result["left_out_by_a"], list)
        assert "left_out_by_b" in result and isinstance(result["left_out_by_b"], list)

        # 3. Disallowed keys must not be present
        assert "hacked" not in result
        assert "malicious_code" not in result
        assert "eval" not in result

        # 4. Must validate against Pydantic response schema
        source_a = NewsSourceSchema(
            title="Normal Headline A",
            url="https://source-a.com",
            publisher="Source A",
            bias="LEFT",
            bias_score=-50,
            summary="Clean summary",
        )
        source_b = NewsSourceSchema(
            title="Normal Headline B",
            url="https://source-b.com",
            publisher="Source B",
            bias="RIGHT",
            bias_score=50,
            summary="Clean summary",
        )

        validated = AnalysisResponse(
            topic=result["topic"],
            source_a=source_a,
            source_b=source_b,
            consensus=result["consensus"],
            left_out_by_a=result["left_out_by_a"],
            left_out_by_b=result["left_out_by_b"],
        )
        assert validated.topic is not None
        assert len(validated.consensus) >= 1

    @pytest.mark.parametrize("injection_text", PROMPT_INJECTIONS)
    def test_llm_processor_schema_safety(self, llm_processor, injection_text):
        """Verifies LLMProcessor returns strictly compliant schemas despite prompt attacks."""
        meta = {"title": "Test", "publisher": "Test"}
        result = llm_processor.synthesize_consensus(
            article_a_text=f"Report with {injection_text}",
            article_b_text=f"Report with {injection_text}",
            source_a_meta=meta,
            source_b_meta=meta,
        )
        assert "consensus" in result
        assert isinstance(result["consensus"], list)
        assert "left_out_by_a" in result
        assert "left_out_by_b" in result
