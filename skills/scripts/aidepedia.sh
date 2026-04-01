#!/bin/bash
# AIdepedia Query Helper Script
# Usage: aidepedia.sh <command> [arguments]

set -e

BASE_URL="https://aidepedia.com"

case "$1" in
  list|ls)
    # List articles (opens in browser or returns HTML)
    echo "Opening articles list: $BASE_URL/articles"
    open "$BASE_URL/articles" 2>/dev/null || curl -s "$BASE_URL/articles"
    ;;

  get|show)
    if [ -z "$2" ]; then
      echo "Usage: aidepedia.sh get <slug>"
      exit 1
    fi
    echo "Fetching article: $2"
    curl -s "$BASE_URL/articles/$2"
    ;;

  search)
    if [ -z "$2" ]; then
      echo "Usage: aidepedia.sh search <query>"
      exit 1
    fi
    query=$(echo "$2" | sed 's/ /+/g')
    echo "Searching for: $2"
    open "$BASE_URL/articles?search=$query" 2>/dev/null || curl -s "$BASE_URL/articles?search=$query"
    ;;

  about)
    echo "Opening about page"
    open "$BASE_URL/about" 2>/dev/null || curl -s "$BASE_URL/about"
    ;;

  help|--help|-h)
    echo "AIdepedia Query Helper"
    echo ""
    echo "Commands:"
    echo "  list, ls              List all articles"
    echo "  get <slug>            Get article by slug"
    echo "  search <query>        Search articles"
    echo "  about                 View about page"
    echo "  help                  Show this help"
    echo ""
    echo "Examples:"
    echo "  aidepedia.sh list"
    echo "  aidepedia.sh get machine-learning"
    echo "  aidepedia.sh search \"artificial intelligence\""
    ;;

  *)
    echo "Unknown command: $1"
    echo "Run 'aidepedia.sh help' for usage"
    exit 1
    ;;
esac
