#!/bin/bash
set -e

export PKG_CONFIG_PATH=$THIRDPARTYDIR/dependencies/lib/pkgconfig
export LDFLAGS=-L$THIRDPARTYDIR/dependencies/lib
export CPATH=$THIRDPARTYDIR/dependencies/include
export LD_LIBRARY_PATH=$THIRDPARTYDIR/dependencies/lib:$LD_LIBRARY_PATH
export NB_CORES=$(sysctl -n hw.logicalcpu)
export MAKEFLAGS="-j$((NB_CORES+1)) -l${NB_CORES}"

BASEDIR=$(dirname "$0")

echo [darwin-build] Will build files in $THIRDPARTYDIR

# Build dependencies
echo [darwin-build] Building development dependencies with brew
for pkg in cmake automake autoconf libtool pkg-config; do
  if !(brew list -1 | grep -q "^${pkg}\$"); then
    brew install $pkg
  fi
done

echo [darwin-build] Building 3rdparty dependencies
cd $BASEDIR && ./dependencies.sh

export DYLD_LIBRARY_PATH=$THIRDPARTYDIR/dependencies/lib

echo [darwin-build] Building poppler-utils
cd $BASEDIR && ./poppler.sh

echo [darwin-build] Building tesseract
cd $BASEDIR && ./tesseract.sh

echo [darwin-build] Building opencv
cd $BASEDIR && ./opencv.sh

echo [darwin-build] Remove files
cd $THIRDPARTYDIR
rm -rf dependencies/share dependencies/include dependencies/bin dependencies/etc/fonts/conf.d
rm -rf poppler/share $(find poppler/bin -type f ! -name 'pdftotext' -and ! -name 'pdfimages')
rm -rf opencv/share
rm -rf tesseract/include tesseract/share/man

for f in $(find $THIRDPARTYDIR -type f -name '*.dylib' -or -path '*/bin/*')
do
  if [ -f "$f" ]
  then
    DIR_PREFIX="@loader_path/../.."
    DYLIBS=`otool -L $f | grep "$THIRDPARTYDIR" | awk -F' ' '{ print $1 }'`
    for dylib in $DYLIBS
    do
      install_name_tool -change $dylib "$DIR_PREFIX${dylib#$THIRDPARTYDIR}" "$f"
    done
  fi
done
