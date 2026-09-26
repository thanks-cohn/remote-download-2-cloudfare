cmake_minimum_required(VERSION 3.20)
project(remote_asset_ingest C)

add_executable(remote-asset-ingest WIN32
  src/main.c
)

target_compile_definitions(remote-asset-ingest PRIVATE
  UNICODE
  _UNICODE
  WIN32_LEAN_AND_MEAN
  _WIN32_WINNT=0x0A00
)

target_link_libraries(remote-asset-ingest PRIVATE
  winhttp
  ws2_32
  crypt32
  comctl32
)
