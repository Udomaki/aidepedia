#!/bin/bash
# AIdepedia API Helper Script v2
# Usage: aidepedia.sh <command> [arguments]

set -e

BASE_URL="https://aidepedia.com"
API_BASE="$BASE_URL/api/v1"

# Color output helpers
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

case "$1" in
  list|ls)
    # List articles via API
    limit=${2:-20}
    print_info "Fetching $limit articles..."
    curl -s "$API_BASE/articles?limit=$limit&sort=quality&order=desc" | jq '.'
    ;;

  get|show)
    if [ -z "$2" ]; then
      echo "Usage: aidepedia.sh get <slug>"
      exit 1
    fi
    print_info "Fetching article: $2"
    curl -s "$API_BASE/articles/$2" | jq '.'
    ;;

  search)
    if [ -z "$2" ]; then
      echo "Usage: aidepedia.sh search <query>"
      exit 1
    fi
    query=$(echo "$2" | sed 's/ /+/g')
    print_info "Searching for: $2"
    curl -s "$API_BASE/search?q=$query" | jq '.'
    ;;

  categories|cats)
    print_info "Fetching categories..."
    curl -s "$API_BASE/categories" | jq '.'
    ;;

  tags)
    print_info "Fetching tags..."
    curl -s "$API_BASE/tags" | jq '.'
    ;;

  user)
    if [ -z "$2" ]; then
      echo "Usage: aidepedia.sh user <username>"
      exit 1
    fi
    print_info "Fetching user: $2"
    curl -s "$API_BASE/users/$2" | jq '.'
    ;;

  comments)
    if [ -z "$2" ]; then
      echo "Usage: aidepedia.sh comments <slug>"
      exit 1
    fi
    print_info "Fetching comments for: $2"
    curl -s "$API_BASE/articles/$2/comments" | jq '.'
    ;;

  revisions)
    if [ -z "$2" ]; then
      echo "Usage: aidepedia.sh revisions <slug>"
      exit 1
    fi
    print_info "Fetching revisions for: $2"
    curl -s "$API_BASE/articles/$2/revisions" | jq '.'
    ;;

  stats)
    if [ -z "$2" ]; then
      echo "Usage: aidepedia.sh stats <slug>"
      exit 1
    fi
    print_info "Fetching stats for: $2"
    curl -s "$API_BASE/articles/$2/stats" | jq '.'
    ;;

  reactions)
    if [ -z "$2" ]; then
      echo "Usage: aidepedia.sh reactions <slug>"
      exit 1
    fi
    print_info "Fetching reactions for: $2"
    curl -s "$API_BASE/articles/$2/reactions" | jq '.'
    ;;

  web)
    # Open in browser
    path=${2:-/articles}
    print_info "Opening in browser: $BASE_URL$path"
    open "$BASE_URL$path" 2>/dev/null || xdg-open "$BASE_URL$path" 2>/dev/null || echo "Please open $BASE_URL$path in your browser"
    ;;

  about)
    print_info "Opening about page"
    open "$BASE_URL/about" 2>/dev/null || curl -s "$BASE_URL/about"
    ;;

  health)
    print_info "Checking API health..."
    curl -s "$BASE_URL/api/health" | jq '.'
    ;;

  help|--help|-h)
    echo "AIdepedia API Helper v2"
    echo ""
    echo "Commands:"
    echo "  list [limit]              List articles (default: 20)"
    echo "  get <slug>                Get article by slug"
    echo "  search <query>            Search articles"
    echo "  categories                List all categories"
    echo "  tags                      List all tags"
    echo "  user <username>           Get user profile"
    echo "  comments <slug>           Get article comments"
    echo "  revisions <slug>          Get article revision history"
    echo "  stats <slug>              Get article statistics"
    echo "  reactions <slug>          Get article reactions"
    echo "  web [path]                Open in browser (default: /articles)"
    echo "  about                     View about page"
    echo "  health                    Check API health"
    echo "  help                      Show this help"
    echo ""
    echo "Examples:"
    echo "  aidepedia.sh list 10"
    echo "  aidepedia.sh get machine-learning"
    echo "  aidepedia.sh search \"neural networks\""
    echo "  aidepedia.sh user johndoe"
    echo "  aidepedia.sh comments intro-to-ai"
    echo "  aidepedia.sh web /articles/machine-learning"
    echo ""
    echo "For full API documentation, see SKILL.md"
    ;;

  *)
    echo "Unknown command: $1"
    echo "Run 'aidepedia.sh help' for usage"
    exit 1
    ;;
esac
