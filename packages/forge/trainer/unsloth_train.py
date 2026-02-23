"""
Titan Forge — Unsloth Training Script
Unsloth is 2-5x faster than standard Axolotl for QLoRA fine-tuning.
Run: python unsloth_train.py --config axolotl-phase1-general.yml

Install: pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
"""

import argparse
import json
import os
import yaml
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description="Titan Forge Unsloth Trainer")
    parser.add_argument("--config", required=True, help="Path to Axolotl-compatible YAML config")
    parser.add_argument("--max-samples", type=int, default=None, help="Limit training samples")
    args = parser.parse_args()

    # Load config
    with open(args.config) as f:
        config = yaml.safe_load(f)

    print(f"=== Titan Forge (Unsloth) ===")
    print(f"Base model: {config['base_model']}")
    print(f"Output: {config['output_dir']}")
    print(f"Epochs: {config['num_epochs']}")
    print("")

    try:
        from unsloth import FastLanguageModel
        from trl import SFTTrainer
        from transformers import TrainingArguments
        from datasets import load_dataset
    except ImportError as e:
        print(f"ERROR: {e}")
        print("Install with: pip install unsloth trl datasets")
        return

    # Load model with 4-bit quantization
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=config["base_model"],
        max_seq_length=config.get("sequence_len", 8192),
        dtype=None,
        load_in_4bit=config.get("load_in_4bit", True),
    )

    # Apply QLoRA
    model = FastLanguageModel.get_peft_model(
        model,
        r=config.get("lora_r", 64),
        target_modules=config.get("lora_target_modules", [
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ]),
        lora_alpha=config.get("lora_alpha", 16),
        lora_dropout=config.get("lora_dropout", 0.05),
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=config.get("seed", 42),
    )

    # Load dataset
    dataset_config = config["datasets"][0]
    dataset_path = dataset_config["path"]

    dataset = load_dataset("json", data_files=dataset_path, split="train")
    if args.max_samples:
        dataset = dataset.select(range(min(args.max_samples, len(dataset))))

    print(f"Loaded {len(dataset)} training samples")

    # Format for ChatML
    def format_sharegpt(example):
        convs = example.get("conversations", [])
        text = ""
        for turn in convs:
            role = turn.get("from", "")
            value = turn.get("value", "")
            if role == "system":
                text += f"<|im_start|>system\n{value}<|im_end|>\n"
            elif role == "human":
                text += f"<|im_start|>user\n{value}<|im_end|>\n"
            elif role == "gpt":
                text += f"<|im_start|>assistant\n{value}<|im_end|>\n"
        return {"text": text}

    dataset = dataset.map(format_sharegpt, remove_columns=dataset.column_names)

    # Training args
    training_args = TrainingArguments(
        per_device_train_batch_size=config.get("micro_batch_size", 2),
        gradient_accumulation_steps=config.get("gradient_accumulation_steps", 4),
        warmup_steps=config.get("warmup_steps", 20),
        num_train_epochs=config.get("num_epochs", 3),
        learning_rate=config.get("learning_rate", 2e-4),
        fp16=True,
        logging_steps=config.get("logging_steps", 10),
        optim="adamw_8bit",
        weight_decay=0.01,
        lr_scheduler_type="cosine",
        seed=config.get("seed", 42),
        output_dir=config["output_dir"],
        save_steps=config.get("save_steps", 500),
        save_total_limit=config.get("save_total_limit", 3),
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=config.get("sequence_len", 8192),
        dataset_num_proc=2,
        packing=config.get("sample_packing", True),
        args=training_args,
    )

    print("Starting training...")
    trainer.train()

    # Save the final model
    output_dir = config["output_dir"]
    os.makedirs(output_dir, exist_ok=True)
    model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)
    print(f"\nModel saved to: {output_dir}")
    print("\nNext: merge the adapter for deployment:")
    print(f"  python -c \"from peft import PeftModel; from transformers import AutoModelForCausalLM; ...")

if __name__ == "__main__":
    main()
