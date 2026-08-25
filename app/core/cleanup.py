"""
Cleanup utilities for managing disk space and old files.
"""

import os
import time
import shutil
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def cleanup_old_protein_preparations(
    results_dir: str,
    max_age_days: int = 7,
    dry_run: bool = False
) -> dict:
    """
    پاک کردن پوشه‌های protein preparation قدیمی‌تر از max_age_days روز.

    Args:
        results_dir: آدرس پوشه results
        max_age_days: حداکثر سن پوشه به روز
        dry_run: اگر True باشد، فقط لیست می‌کند و پاک نمی‌کند

    Returns:
        دیکشنری حاوی آمار پاکسازی
    """
    results_path = Path(results_dir)
    if not results_path.exists():
        logger.warning(f"Results directory does not exist: {results_dir}")
        return {"error": "Directory not found", "cleaned": 0, "total_size": 0}

    cutoff_timestamp = time.time() - (max_age_days * 24 * 60 * 60)
    cleaned_count = 0
    total_size_freed = 0
    errors = []

    logger.info(f"🧹 Starting cleanup of protein preparation files older than {max_age_days} days")
    logger.info(f"📂 Scanning directory: {results_dir}")
    if dry_run:
        logger.info("⚠️  DRY RUN MODE - No files will be deleted")

    try:
        # پیدا کردن تمام پوشه‌های protein_prep_*
        prep_dirs = list(results_path.glob("protein_prep_*"))
        logger.info(f"📊 Found {len(prep_dirs)} protein preparation directories")

        for prep_dir in prep_dirs:
            try:
                # استخراج timestamp از نام پوشه
                dir_name = prep_dir.name
                if not dir_name.startswith("protein_prep_"):
                    continue

                # timestamp در میلی‌ثانیه است
                timestamp_str = dir_name.split("_")[-1]
                if not timestamp_str.isdigit():
                    logger.warning(f"Invalid directory name format: {dir_name}")
                    continue

                timestamp = int(timestamp_str) / 1000  # تبدیل به ثانیه

                # بررسی سن پوشه
                if timestamp < cutoff_timestamp:
                    # محاسبه حجم پوشه
                    dir_size = sum(
                        f.stat().st_size
                        for f in prep_dir.rglob('*')
                        if f.is_file()
                    )
                    dir_size_mb = dir_size / (1024 * 1024)

                    # محاسبه سن به روز
                    age_days = (time.time() - timestamp) / (24 * 60 * 60)

                    logger.info(
                        f"🗑️  {'[DRY RUN] Would delete' if dry_run else 'Deleting'}: "
                        f"{prep_dir.name} (Age: {age_days:.1f} days, Size: {dir_size_mb:.2f} MB)"
                    )

                    if not dry_run:
                        shutil.rmtree(prep_dir)
                        total_size_freed += dir_size
                        cleaned_count += 1
                        logger.info(f"✅ Deleted: {prep_dir.name}")
                    else:
                        total_size_freed += dir_size
                        cleaned_count += 1

            except Exception as dir_error:
                error_msg = f"Failed to process directory {prep_dir.name}: {str(dir_error)}"
                logger.error(error_msg)
                errors.append(error_msg)

        total_size_mb = total_size_freed / (1024 * 1024)
        logger.info(
            f"✅ Cleanup completed: "
            f"{'Would free' if dry_run else 'Freed'} {total_size_mb:.2f} MB "
            f"from {cleaned_count} directories"
        )

        return {
            "success": True,
            "cleaned_count": cleaned_count,
            "total_size_bytes": total_size_freed,
            "total_size_mb": round(total_size_mb, 2),
            "errors": errors,
            "dry_run": dry_run
        }

    except Exception as e:
        logger.error(f"Error during cleanup: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "cleaned_count": cleaned_count,
            "total_size_bytes": total_size_freed
        }


def get_protein_prep_storage_stats(results_dir: str) -> dict:
    """
    دریافت آمار ذخیره‌سازی پوشه‌های protein preparation.

    Args:
        results_dir: آدرس پوشه results

    Returns:
        دیکشنری حاوی آمار
    """
    results_path = Path(results_dir)
    if not results_path.exists():
        return {"error": "Directory not found"}

    try:
        prep_dirs = list(results_path.glob("protein_prep_*"))
        total_size = 0
        oldest_timestamp = None
        newest_timestamp = None

        for prep_dir in prep_dirs:
            try:
                # محاسبه حجم
                dir_size = sum(
                    f.stat().st_size
                    for f in prep_dir.rglob('*')
                    if f.is_file()
                )
                total_size += dir_size

                # استخراج timestamp
                timestamp_str = prep_dir.name.split("_")[-1]
                if timestamp_str.isdigit():
                    timestamp = int(timestamp_str) / 1000

                    if oldest_timestamp is None or timestamp < oldest_timestamp:
                        oldest_timestamp = timestamp

                    if newest_timestamp is None or timestamp > newest_timestamp:
                        newest_timestamp = timestamp

            except Exception:
                continue

        total_size_mb = total_size / (1024 * 1024)
        total_size_gb = total_size / (1024 * 1024 * 1024)

        result = {
            "success": True,
            "total_directories": len(prep_dirs),
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size_mb, 2),
            "total_size_gb": round(total_size_gb, 3)
        }

        if oldest_timestamp:
            oldest_age_days = (time.time() - oldest_timestamp) / (24 * 60 * 60)
            result["oldest_age_days"] = round(oldest_age_days, 1)

        if newest_timestamp:
            newest_age_days = (time.time() - newest_timestamp) / (24 * 60 * 60)
            result["newest_age_days"] = round(newest_age_days, 1)

        return result

    except Exception as e:
        return {"success": False, "error": str(e)}


# برای اجرای مستقیم از command line
if __name__ == "__main__":
    import sys
    from app.core.config import settings

    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    if len(sys.argv) > 1:
        command = sys.argv[1]

        if command == "cleanup":
            # دریافت پارامترهای اختیاری
            days = int(sys.argv[2]) if len(sys.argv) > 2 else 7
            dry_run = "--dry-run" in sys.argv or "-n" in sys.argv

            result = cleanup_old_protein_preparations(
                settings.RESULTS_DIR,
                max_age_days=days,
                dry_run=dry_run
            )
            print("\n📊 Cleanup Results:")
            for key, value in result.items():
                print(f"  {key}: {value}")

        elif command == "stats":
            result = get_protein_prep_storage_stats(settings.RESULTS_DIR)
            print("\n📊 Storage Statistics:")
            for key, value in result.items():
                print(f"  {key}: {value}")

        else:
            print("❌ Unknown command. Use: cleanup [days] [--dry-run] or stats")
            sys.exit(1)
    else:
        print("Usage:")
        print("  python -m app.core.cleanup cleanup [days] [--dry-run]  # Clean old files")
        print("  python -m app.core.cleanup stats                       # Show statistics")
        print("\nExamples:")
        print("  python -m app.core.cleanup cleanup 7 --dry-run  # See what would be deleted")
        print("  python -m app.core.cleanup cleanup 7            # Delete files older than 7 days")
        print("  python -m app.core.cleanup stats                # Show storage stats")
